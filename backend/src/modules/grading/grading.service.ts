import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService, DbTransactionClient } from '../../database/database.service';
import { AuditService } from '../../common/audit.service';
import { SessionTokenPayload } from '../../common/crypto.util';
import * as crypto from 'crypto';

export function evaluateAutoGradableQuestion(
  questionSnapshot: {
    type: string;
    weight: number;
    answerKey: Record<string, any>;
  },
  answerPayload: Record<string, any> | null | undefined,
): { isAutoGraded: boolean; isCorrect: boolean | null; scoreAwarded: number; maxScore: number } {
  const maxScore = Number(questionSnapshot.weight || 1);
  if (!answerPayload) {
    return {
      isAutoGraded: questionSnapshot.type !== 'ESSAY',
      isCorrect: questionSnapshot.type === 'ESSAY' ? null : false,
      scoreAwarded: 0,
      maxScore,
    };
  }

  const qType = questionSnapshot.type;
  const key = questionSnapshot.answerKey || {};

  if (qType === 'SINGLE_CHOICE') {
    const selected = String(answerPayload.selectedOption ?? answerPayload.value ?? '').trim().toUpperCase();
    const expected = String(key.selectedOption ?? key.value ?? '').trim().toUpperCase();
    const isCorrect = Boolean(selected && expected && selected === expected);
    return {
      isAutoGraded: true,
      isCorrect,
      scoreAwarded: isCorrect ? maxScore : 0,
      maxScore,
    };
  }

  if (qType === 'TRUE_FALSE') {
    const rawVal = answerPayload.selectedOption ?? answerPayload.value;
    const normalizedSelected =
      typeof rawVal === 'boolean'
        ? rawVal
          ? 'TRUE'
          : 'FALSE'
        : String(rawVal ?? '').trim().toUpperCase();
    const expectedRaw = key.selectedOption ?? key.value;
    const normalizedExpected =
      typeof expectedRaw === 'boolean'
        ? expectedRaw
          ? 'TRUE'
          : 'FALSE'
        : String(expectedRaw ?? '').trim().toUpperCase();
    const isCorrect = Boolean(normalizedSelected && normalizedSelected === normalizedExpected);
    return {
      isAutoGraded: true,
      isCorrect,
      scoreAwarded: isCorrect ? maxScore : 0,
      maxScore,
    };
  }

  if (qType === 'MULTIPLE_CHOICE_COMPLEX') {
    const selectedArr: string[] = Array.isArray(answerPayload.selectedOptions)
      ? answerPayload.selectedOptions.map((s: any) => String(s).trim().toUpperCase()).sort()
      : [];
    const expectedArr: string[] = Array.isArray(key.selectedOptions)
      ? key.selectedOptions.map((s: any) => String(s).trim().toUpperCase()).sort()
      : [];
    const isExactMatch =
      selectedArr.length === expectedArr.length &&
      selectedArr.every((val, idx) => val === expectedArr[idx]);
    return {
      isAutoGraded: true,
      isCorrect: isExactMatch,
      scoreAwarded: isExactMatch ? maxScore : 0,
      maxScore,
    };
  }

  if (qType === 'SHORT_ANSWER') {
    const studentText = String(answerPayload.text ?? answerPayload.value ?? '')
      .trim()
      .toLowerCase();
    const acceptedList: string[] = Array.isArray(key.acceptedAnswers)
      ? key.acceptedAnswers.map((a: any) => String(a).trim().toLowerCase())
      : [];
    const isCorrect = Boolean(studentText && acceptedList.includes(studentText));
    return {
      isAutoGraded: true,
      isCorrect,
      scoreAwarded: isCorrect ? maxScore : 0,
      maxScore,
    };
  }

  // ESSAY requires teacher manual grading
  return {
    isAutoGraded: false,
    isCorrect: null,
    scoreAwarded: 0,
    maxScore,
  };
}

@Injectable()
export class GradingService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async runSubmissionGradingInTx(
    tx: DbTransactionClient,
    participantId: string,
    examId: string,
  ): Promise<{
    autoScore: number;
    manualScore: number;
    totalScore: number;
    maxPossibleScore: number;
    percentageScore: number;
    gradingStatus: 'AUTO_GRADED' | 'PENDING_MANUAL_ESSAY' | 'FULLY_GRADED';
    answersSnapshot: any[];
  }> {
    const examQuestionsRes = await tx.query<{
      question_id: string;
      question_version: number;
      question_snapshot: any;
      order_no: number;
      weight: string;
    }>(
      `SELECT question_id, question_version, question_snapshot, order_no, weight
       FROM exam_questions
       WHERE exam_id = $1
       ORDER BY order_no ASC`,
      [examId],
    );

    const participantAnswersRes = await tx.query<{
      question_id: string;
      answer_payload: any;
      answer_version: number;
      is_marked_for_review: boolean;
    }>(
      `SELECT question_id, answer_payload, answer_version, is_marked_for_review
       FROM participant_answers
       WHERE exam_participant_id = $1`,
      [participantId],
    );

    const answerByQuestionId = new Map<string, any>();
    for (const ans of participantAnswersRes.rows) {
      answerByQuestionId.set(ans.question_id, ans);
    }

    let autoScore = 0;
    let manualScore = 0;
    let maxPossibleScore = 0;
    let hasEssay = false;
    const answersSnapshot: any[] = [];

    for (const eq of examQuestionsRes.rows) {
      const snapshot =
        typeof eq.question_snapshot === 'string'
          ? JSON.parse(eq.question_snapshot)
          : eq.question_snapshot;
      const weight = Number(eq.weight || snapshot.weight || 1);
      maxPossibleScore += weight;

      const ansRow = answerByQuestionId.get(eq.question_id);
      const payload = ansRow ? ansRow.answer_payload : null;
      const evalResult = evaluateAutoGradableQuestion(
        {
          type: snapshot.type,
          weight,
          answerKey: snapshot.answerKey,
        },
        payload,
      );

      if (!evalResult.isAutoGraded) {
        hasEssay = true;
      } else {
        autoScore += evalResult.scoreAwarded;
      }

      await tx.query(
        `INSERT INTO grading_records (
          id, exam_participant_id, question_id, question_version,
          is_auto_graded, is_correct, score_awarded, max_score, graded_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        ON CONFLICT (exam_participant_id, question_id)
        DO UPDATE SET
          question_version = EXCLUDED.question_version,
          is_auto_graded = EXCLUDED.is_auto_graded,
          is_correct = EXCLUDED.is_correct,
          score_awarded = CASE WHEN grading_records.is_auto_graded THEN EXCLUDED.score_awarded ELSE grading_records.score_awarded END,
          max_score = EXCLUDED.max_score`,
        [
          crypto.randomUUID(),
          participantId,
          eq.question_id,
          eq.question_version,
          evalResult.isAutoGraded,
          evalResult.isCorrect,
          evalResult.scoreAwarded,
          evalResult.maxScore,
        ],
      );

      answersSnapshot.push({
        questionId: eq.question_id,
        questionVersion: eq.question_version,
        answerPayload: payload,
        answerVersion: ansRow?.answer_version || 0,
        scoreAwarded: evalResult.scoreAwarded,
        maxScore: evalResult.maxScore,
        isAutoGraded: evalResult.isAutoGraded,
      });
    }

    const totalScore = Math.round((autoScore + manualScore) * 100) / 100;
    const percentageScore =
      maxPossibleScore > 0 ? Math.round((totalScore / maxPossibleScore) * 10000) / 100 : 0;
    const gradingStatus = hasEssay ? 'PENDING_MANUAL_ESSAY' : 'AUTO_GRADED';

    await tx.query(
      `UPDATE exam_participants SET final_score = $2, updated_at = NOW() WHERE id = $1`,
      [participantId, totalScore],
    );

    return {
      autoScore,
      manualScore,
      totalScore,
      maxPossibleScore,
      percentageScore,
      gradingStatus,
      answersSnapshot,
    };
  }

  async gradeEssayManually(
    actor: SessionTokenPayload,
    participantId: string,
    dto: { questionId: string; scoreAwarded: number; feedback?: string },
  ) {
    // Verify participant & teacher class/exam authorization
    const partRes = await this.db.query<{
      id: string;
      exam_id: string;
      class_id: string | null;
      exam_creator_id: string;
    }>(
      `SELECT ep.id, ep.exam_id, ep.class_id, e.created_by AS exam_creator_id
       FROM exam_participants ep
       JOIN exams e ON e.id = ep.exam_id
       WHERE ep.id = $1 AND e.school_id = $2`,
      [participantId, actor.schoolId],
    );
    if (partRes.rows.length === 0) {
      throw new NotFoundException('Peserta ujian tidak ditemukan');
    }
    const part = partRes.rows[0];

    if (!actor.roles.includes('ADMIN')) {
      let authorized = part.exam_creator_id === actor.sub;
      if (!authorized && part.class_id) {
        const memberRes = await this.db.query(
          `SELECT 1 FROM class_memberships WHERE class_id = $1 AND user_id = $2 AND membership_role = 'TEACHER'`,
          [part.class_id, actor.sub],
        );
        authorized = memberRes.rows.length > 0;
      }
      if (!authorized) {
        await this.audit.log({
          schoolId: actor.schoolId,
          actorUserId: actor.sub,
          actorRole: actor.roles.join(','),
          action: 'UNAUTHORIZED_GRADING_ATTEMPT',
          targetType: 'EXAM_PARTICIPANT',
          targetId: participantId,
        });
        throw new ForbiddenException('Anda tidak ditugaskan untuk menilai kelas/ujian peserta ini');
      }
    }

    const recordRes = await this.db.query<{ max_score: string }>(
      `SELECT max_score FROM grading_records WHERE exam_participant_id = $1 AND question_id = $2`,
      [participantId, dto.questionId],
    );
    if (recordRes.rows.length === 0) {
      throw new NotFoundException('Catatan penilaian soal tidak ditemukan');
    }
    const maxScore = Number(recordRes.rows[0].max_score);
    if (dto.scoreAwarded < 0 || dto.scoreAwarded > maxScore) {
      throw new BadRequestException(`Nilai harus berada di antara 0 dan ${maxScore}`);
    }

    const updatedSummary = await this.db.withTransaction(async (tx) => {
      await tx.query(
        `UPDATE grading_records
         SET score_awarded = $3::numeric,
             is_correct = ($3::numeric > 0),
             graded_by_user_id = $4,
             feedback = $5,
             graded_at = NOW()
         WHERE exam_participant_id = $1 AND question_id = $2`,
        [participantId, dto.questionId, dto.scoreAwarded, actor.sub, dto.feedback || null],
      );

      const totalsRes = await tx.query<{
        auto_score: string;
        manual_score: string;
        max_possible: string;
      }>(
        `SELECT
           COALESCE(SUM(score_awarded) FILTER (WHERE is_auto_graded = TRUE), 0)::text AS auto_score,
           COALESCE(SUM(score_awarded) FILTER (WHERE is_auto_graded = FALSE), 0)::text AS manual_score,
           COALESCE(SUM(max_score), 0)::text AS max_possible
         FROM grading_records
         WHERE exam_participant_id = $1`,
        [participantId],
      );

      const autoScore = Number(totalsRes.rows[0].auto_score);
      const manualScore = Number(totalsRes.rows[0].manual_score);
      const maxPossible = Number(totalsRes.rows[0].max_possible);
      const totalScore = Math.round((autoScore + manualScore) * 100) / 100;
      const percentageScore =
        maxPossible > 0 ? Math.round((totalScore / maxPossible) * 10000) / 100 : 0;

      await tx.query(
        `UPDATE exam_submissions
         SET auto_score = $2,
             manual_score = $3,
             total_score = $4,
             percentage_score = $5,
             grading_status = 'FULLY_GRADED'
         WHERE exam_participant_id = $1`,
        [participantId, autoScore, manualScore, totalScore, percentageScore],
      );

      await tx.query(
        `UPDATE exam_participants SET final_score = $2, updated_at = NOW() WHERE id = $1`,
        [participantId, totalScore],
      );

      return { autoScore, manualScore, totalScore, maxPossible, percentageScore };
    });

    await this.audit.log({
      schoolId: actor.schoolId,
      actorUserId: actor.sub,
      actorRole: actor.roles.join(','),
      action: 'ESSAY_MANUALLY_GRADED',
      targetType: 'EXAM_PARTICIPANT',
      targetId: participantId,
      metadata: {
        questionId: dto.questionId,
        scoreAwarded: dto.scoreAwarded,
        newTotalScore: updatedSummary.totalScore,
      },
    });

    return {
      participantId,
      questionId: dto.questionId,
      scoreAwarded: dto.scoreAwarded,
      ...updatedSummary,
      gradingStatus: 'FULLY_GRADED',
    };
  }

  async getExamAnalyticsAndItemAnalysis(actor: SessionTokenPayload, examId: string) {
    const examRes = await this.db.query<{
      id: string;
      title: string;
      code: string;
      passing_score: string;
      created_by: string;
    }>(`SELECT id, title, code, passing_score, created_by FROM exams WHERE id = $1 AND school_id = $2`, [
      examId,
      actor.schoolId,
    ]);
    if (examRes.rows.length === 0) {
      throw new NotFoundException('Ujian tidak ditemukan');
    }
    const exam = examRes.rows[0];

    if (!actor.roles.includes('ADMIN') && exam.created_by !== actor.sub) {
      const assignedRes = await this.db.query(
        `SELECT 1 FROM exam_assignments ea
         JOIN class_memberships cm ON cm.class_id = ea.class_id
         WHERE ea.exam_id = $1 AND cm.user_id = $2 AND cm.membership_role = 'TEACHER'`,
        [examId, actor.sub],
      );
      if (assignedRes.rows.length === 0) {
        throw new ForbiddenException('Guru tidak memiliki akses ke hasil ujian kelas ini');
      }
    }

    const submissionsRes = await this.db.query<{
      participant_id: string;
      student_name: string;
      identifier_code: string;
      class_name: string;
      auto_score: string;
      manual_score: string;
      total_score: string;
      percentage_score: string;
      grading_status: string;
      submitted_at: string;
    }>(
      `SELECT ep.id AS participant_id, u.full_name AS student_name, u.identifier_code,
              COALESCE(c.name, '-') AS class_name,
              esub.auto_score, esub.manual_score, esub.total_score, esub.percentage_score,
              esub.grading_status, esub.submitted_at
       FROM exam_submissions esub
       JOIN exam_participants ep ON ep.id = esub.exam_participant_id
       JOIN users u ON u.id = ep.student_user_id
       LEFT JOIN classes c ON c.id = ep.class_id
       WHERE ep.exam_id = $1
       ORDER BY esub.total_score DESC`,
      [examId],
    );

    const itemStatsRes = await this.db.query<{
      question_id: string;
      order_no: number;
      question_version: number;
      total_attempts: string;
      correct_count: string;
      avg_score: string;
      max_score: string;
    }>(
      `SELECT eq.question_id, eq.order_no, eq.question_version,
              COUNT(gr.id)::text AS total_attempts,
              COUNT(gr.id) FILTER (WHERE gr.is_correct = TRUE)::text AS correct_count,
              COALESCE(AVG(gr.score_awarded), 0)::text AS avg_score,
              MAX(eq.weight)::text AS max_score
       FROM exam_questions eq
       LEFT JOIN grading_records gr ON gr.question_id = eq.question_id
         AND gr.exam_participant_id IN (SELECT id FROM exam_participants WHERE exam_id = $1)
       WHERE eq.exam_id = $1
       GROUP BY eq.question_id, eq.order_no, eq.question_version
       ORDER BY eq.order_no ASC`,
      [examId],
    );

    const scores = submissionsRes.rows.map((r) => Number(r.total_score));
    const avgTotalScore =
      scores.length > 0
        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
        : 0;

    return {
      exam: {
        id: exam.id,
        title: exam.title,
        code: exam.code,
        passingScore: Number(exam.passing_score),
      },
      summary: {
        totalSubmissions: submissionsRes.rows.length,
        averageScore: avgTotalScore,
        highestScore: scores.length > 0 ? Math.max(...scores) : 0,
        lowestScore: scores.length > 0 ? Math.min(...scores) : 0,
        passedCount: scores.filter((s) => s >= Number(exam.passing_score)).length,
      },
      submissions: submissionsRes.rows.map((r) => ({
        ...r,
        auto_score: Number(r.auto_score),
        manual_score: Number(r.manual_score),
        total_score: Number(r.total_score),
        percentage_score: Number(r.percentage_score),
      })),
      itemAnalysis: itemStatsRes.rows.map((item) => {
        const attempts = Number(item.total_attempts);
        const correct = Number(item.correct_count);
        const difficultyIndexP = attempts > 0 ? Math.round((correct / attempts) * 100) / 100 : 0;
        return {
          questionId: item.question_id,
          orderNo: item.order_no,
          questionVersion: item.question_version,
          totalAttempts: attempts,
          correctCount: correct,
          difficultyIndexP,
          difficultyInterpretation:
            difficultyIndexP >= 0.7 ? 'MUDAH' : difficultyIndexP >= 0.3 ? 'SEDANG' : 'SUKAR',
          averageScore: Math.round(Number(item.avg_score) * 100) / 100,
          maxScore: Number(item.max_score),
        };
      }),
    };
  }

  async exportExamResultsCsv(actor: SessionTokenPayload, examId: string): Promise<string> {
    const analytics = await this.getExamAnalyticsAndItemAnalysis(actor, examId);
    const header = [
      'No',
      'Nama Siswa',
      'NISN/Kode',
      'Kelas',
      'Nilai Otomatis',
      'Nilai Manual Esai',
      'Total Nilai',
      'Persentase (%)',
      'Status Penilaian',
      'Waktu Pengumpulan (UTC)',
    ].join(',');

    const lines = analytics.submissions.map((s, idx) =>
      [
        idx + 1,
        `"${String(s.student_name).replace(/"/g, '""')}"`,
        `"${String(s.identifier_code || '')}"`,
        `"${String(s.class_name || '')}"`,
        s.auto_score,
        s.manual_score,
        s.total_score,
        s.percentage_score,
        s.grading_status,
        s.submitted_at,
      ].join(','),
    );

    return [header, ...lines].join('\n');
  }
}
