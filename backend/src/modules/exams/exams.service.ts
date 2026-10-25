import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { AuditService } from '../../common/audit.service';
import { SessionTokenPayload } from '../../common/crypto.util';
import * as crypto from 'crypto';

export type ExamLifecycleStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'READY'
  | 'IN_PROGRESS'
  | 'PAUSED'
  | 'SUBMITTED'
  | 'EXPIRED'
  | 'CANCELLED';

const VALID_STATE_TRANSITIONS: Record<ExamLifecycleStatus, ExamLifecycleStatus[]> = {
  DRAFT: ['SCHEDULED', 'READY', 'CANCELLED'],
  SCHEDULED: ['READY', 'CANCELLED'],
  READY: ['IN_PROGRESS', 'PAUSED', 'CANCELLED'],
  IN_PROGRESS: ['PAUSED', 'SUBMITTED', 'EXPIRED', 'CANCELLED'],
  PAUSED: ['IN_PROGRESS', 'SUBMITTED', 'EXPIRED', 'CANCELLED'],
  SUBMITTED: [],
  EXPIRED: [],
  CANCELLED: [],
};

export function isValidExamStateTransition(
  fromStatus: ExamLifecycleStatus,
  toStatus: ExamLifecycleStatus,
): boolean {
  if (fromStatus === toStatus) return true;
  return (VALID_STATE_TRANSITIONS[fromStatus] || []).includes(toStatus);
}

@Injectable()
export class ExamsService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async listExams(actor: SessionTokenPayload) {
    if (actor.roles.includes('ADMIN') || actor.roles.includes('PROCTOR')) {
      const res = await this.db.query(
        `SELECT e.*, s.name AS subject_name, s.code AS subject_code, u.full_name AS creator_name,
                (SELECT COUNT(*)::int FROM exam_questions eq WHERE eq.exam_id = e.id) AS question_count
         FROM exams e
         JOIN subjects s ON s.id = e.subject_id
         JOIN users u ON u.id = e.created_by
         WHERE e.school_id = $1 AND e.deleted_at IS NULL
         ORDER BY e.created_at DESC`,
        [actor.schoolId],
      );
      return res.rows;
    }

    // Teacher sees exams they created or assigned to their classes
    const res = await this.db.query(
      `SELECT e.*, s.name AS subject_name, s.code AS subject_code, u.full_name AS creator_name,
              (SELECT COUNT(*)::int FROM exam_questions eq WHERE eq.exam_id = e.id) AS question_count
       FROM exams e
       JOIN subjects s ON s.id = e.subject_id
       JOIN users u ON u.id = e.created_by
       WHERE e.school_id = $1 AND e.deleted_at IS NULL
         AND (
           e.created_by = $2
           OR EXISTS (
             SELECT 1 FROM exam_assignments ea
             JOIN class_memberships cm ON cm.class_id = ea.class_id
             WHERE ea.exam_id = e.id AND cm.user_id = $2
           )
         )
       ORDER BY e.created_at DESC`,
      [actor.schoolId, actor.sub],
    );
    return res.rows;
  }

  async createExam(
    actor: SessionTokenPayload,
    dto: {
      subjectId: string;
      academicYearId: string;
      title: string;
      code: string;
      instructionsHtml?: string;
      durationMinutes?: number;
      randomizeQuestions?: boolean;
      randomizeOptions?: boolean;
      browserPolicy?: 'SECURE_BROWSER_REQUIRED' | 'SECURE_BROWSER_OPTIONAL' | 'STANDARD_BROWSER';
      sebConfigKeyHash?: string;
      cameraEnabled?: boolean;
      cameraRetentionDays?: number;
      offlineEnabled?: boolean;
      offlineGracePeriodSeconds?: number;
      maxOfflineUnsyncedAnswers?: number;
      conflictPolicy?: 'LATEST_VALID_WITHIN_GRACE' | 'SERVER_WINS_LOG_BOTH';
      publishResults?: boolean;
      passingScore?: number;
      questionIds?: string[];
      classIds?: string[];
    },
  ) {
    if (!dto.subjectId || !dto.academicYearId || !dto.title || !dto.code) {
      throw new BadRequestException('subjectId, academicYearId, title, dan code wajib diisi');
    }

    const examId = crypto.randomUUID();
    await this.db.withTransaction(async (tx) => {
      await tx.query(
        `INSERT INTO exams (
          id, school_id, subject_id, academic_year_id, title, code, instructions_html,
          status, duration_minutes, randomize_questions, randomize_options,
          browser_policy, seb_config_key_hash, camera_enabled, camera_retention_days,
          offline_enabled, offline_grace_period_seconds, max_offline_unsynced_answers,
          conflict_policy, publish_results, passing_score, created_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          'DRAFT', $8, $9, $10,
          $11, $12, $13, $14,
          $15, $16, $17,
          $18, $19, $20, $21
        )`,
        [
          examId,
          actor.schoolId,
          dto.subjectId,
          dto.academicYearId,
          dto.title.trim(),
          dto.code.trim().toUpperCase(),
          dto.instructionsHtml || '',
          dto.durationMinutes ?? 90,
          dto.randomizeQuestions ?? true,
          dto.randomizeOptions ?? true,
          dto.browserPolicy || 'STANDARD_BROWSER',
          dto.sebConfigKeyHash || null,
          Boolean(dto.cameraEnabled), // Camera OFF by default
          dto.cameraRetentionDays ?? 14,
          dto.offlineEnabled ?? true,
          dto.offlineGracePeriodSeconds ?? 120,
          dto.maxOfflineUnsyncedAnswers ?? 100,
          dto.conflictPolicy || 'LATEST_VALID_WITHIN_GRACE',
          Boolean(dto.publishResults),
          dto.passingScore ?? 70,
          actor.sub,
        ],
      );

      if (dto.questionIds && dto.questionIds.length > 0) {
        for (let idx = 0; idx < dto.questionIds.length; idx++) {
          const qId = dto.questionIds[idx];
          const qRes = await tx.query('SELECT * FROM questions WHERE id = $1', [qId]);
          if (qRes.rows.length === 0) {
            throw new BadRequestException(`Soal ${qId} tidak ditemukan`);
          }
          const q = qRes.rows[0];
          const optRes = await tx.query(
            'SELECT * FROM question_options WHERE question_id = $1 ORDER BY sort_order ASC',
            [qId],
          );
          const snapshot = {
            id: q.id,
            type: q.question_type,
            version: q.version,
            stem: q.stem_html,
            formula: q.formula_latex,
            weight: Number(q.default_weight),
            answerKey: q.answer_key,
            options: optRes.rows.map((o: any) => ({
              id: o.id,
              key: o.option_key,
              html: o.content_html,
              isCorrect: o.is_correct,
              order: o.sort_order,
            })),
          };
          await tx.query(
            `INSERT INTO exam_questions (id, exam_id, question_id, question_version, question_snapshot, order_no, weight)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (exam_id, question_id) DO NOTHING`,
            [
              crypto.randomUUID(),
              examId,
              qId,
              q.version,
              JSON.stringify(snapshot),
              idx + 1,
              Number(q.default_weight),
            ],
          );
        }
      }

      if (dto.classIds && dto.classIds.length > 0) {
        for (const classId of dto.classIds) {
          await tx.query(
            `INSERT INTO exam_assignments (id, exam_id, class_id, assigned_by)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (exam_id, class_id) DO NOTHING`,
            [crypto.randomUUID(), examId, classId, actor.sub],
          );
        }
      }
    });

    await this.audit.log({
      schoolId: actor.schoolId,
      actorUserId: actor.sub,
      actorRole: actor.roles.join(','),
      action: 'EXAM_CREATED',
      targetType: 'EXAM',
      targetId: examId,
      metadata: {
        title: dto.title,
        code: dto.code,
        browserPolicy: dto.browserPolicy || 'STANDARD_BROWSER',
        cameraEnabled: Boolean(dto.cameraEnabled),
      },
    });

    return { id: examId, status: 'DRAFT', ...dto };
  }

  async transitionExamStatus(
    actor: SessionTokenPayload,
    examId: string,
    targetStatus: ExamLifecycleStatus,
  ) {
    const res = await this.db.query<{
      id: string;
      status: ExamLifecycleStatus;
      created_by: string;
    }>('SELECT id, status, created_by FROM exams WHERE id = $1 AND school_id = $2', [
      examId,
      actor.schoolId,
    ]);
    if (res.rows.length === 0) {
      throw new NotFoundException('Ujian tidak ditemukan');
    }
    const exam = res.rows[0];
    if (!actor.roles.includes('ADMIN') && exam.created_by !== actor.sub) {
      throw new ForbiddenException('Anda tidak berwenang mengubah status paket ujian ini');
    }

    if (!isValidExamStateTransition(exam.status, targetStatus)) {
      throw new BadRequestException(
        `Transisi status ujian dari ${exam.status} ke ${targetStatus} tidak diizinkan oleh state machine`,
      );
    }

    await this.db.query(
      'UPDATE exams SET status = $2, updated_at = NOW() WHERE id = $1',
      [examId, targetStatus],
    );

    await this.audit.log({
      schoolId: actor.schoolId,
      actorUserId: actor.sub,
      actorRole: actor.roles.join(','),
      action: 'EXAM_STATUS_CHANGED',
      targetType: 'EXAM',
      targetId: examId,
      metadata: { from: exam.status, to: targetStatus },
    });

    return { id: examId, previousStatus: exam.status, status: targetStatus };
  }

  async updateExamSecurityAndCameraPolicy(
    actor: SessionTokenPayload,
    examId: string,
    dto: {
      browserPolicy?: 'SECURE_BROWSER_REQUIRED' | 'SECURE_BROWSER_OPTIONAL' | 'STANDARD_BROWSER';
      sebConfigKeyHash?: string;
      cameraEnabled?: boolean;
      cameraRetentionDays?: number;
      offlineEnabled?: boolean;
      offlineGracePeriodSeconds?: number;
      maxOfflineUnsyncedAnswers?: number;
      conflictPolicy?: 'LATEST_VALID_WITHIN_GRACE' | 'SERVER_WINS_LOG_BOTH';
      publishResults?: boolean;
    },
  ) {
    await this.db.query(
      `UPDATE exams
       SET browser_policy = COALESCE($2, browser_policy),
           seb_config_key_hash = COALESCE($3, seb_config_key_hash),
           camera_enabled = COALESCE($4, camera_enabled),
           camera_retention_days = COALESCE($5, camera_retention_days),
           offline_enabled = COALESCE($6, offline_enabled),
           offline_grace_period_seconds = COALESCE($7, offline_grace_period_seconds),
           max_offline_unsynced_answers = COALESCE($8, max_offline_unsynced_answers),
           conflict_policy = COALESCE($9, conflict_policy),
           publish_results = COALESCE($10, publish_results),
           updated_at = NOW()
       WHERE id = $1 AND school_id = $11`,
      [
        examId,
        dto.browserPolicy ?? null,
        dto.sebConfigKeyHash ?? null,
        dto.cameraEnabled ?? null,
        dto.cameraRetentionDays ?? null,
        dto.offlineEnabled ?? null,
        dto.offlineGracePeriodSeconds ?? null,
        dto.maxOfflineUnsyncedAnswers ?? null,
        dto.conflictPolicy ?? null,
        dto.publishResults ?? null,
        actor.schoolId,
      ],
    );

    await this.audit.log({
      schoolId: actor.schoolId,
      actorUserId: actor.sub,
      actorRole: actor.roles.join(','),
      action: 'EXAM_SECURITY_POLICY_UPDATED',
      targetType: 'EXAM',
      targetId: examId,
      metadata: dto,
    });

    return { id: examId, updated: true, ...dto };
  }

  async listSessions(actor: SessionTokenPayload) {
    if (actor.roles.includes('ADMIN')) {
      const res = await this.db.query(
        `SELECT es.*, e.title AS exam_title, e.code AS exam_code, e.browser_policy, e.camera_enabled,
                e.offline_grace_period_seconds, r.name AS room_name, r.code AS room_code,
                (SELECT COUNT(*)::int FROM exam_participants ep WHERE ep.exam_session_id = es.id) AS total_participants
         FROM exam_sessions es
         JOIN exams e ON e.id = es.exam_id
         JOIN rooms r ON r.id = es.room_id
         WHERE e.school_id = $1
         ORDER BY es.scheduled_start_at DESC`,
        [actor.schoolId],
      );
      return res.rows;
    }

    if (actor.roles.includes('PROCTOR')) {
      const res = await this.db.query(
        `SELECT es.*, e.title AS exam_title, e.code AS exam_code, e.browser_policy, e.camera_enabled,
                e.offline_grace_period_seconds, r.name AS room_name, r.code AS room_code,
                (SELECT COUNT(*)::int FROM exam_participants ep WHERE ep.exam_session_id = es.id) AS total_participants
         FROM exam_sessions es
         JOIN exams e ON e.id = es.exam_id
         JOIN rooms r ON r.id = es.room_id
         JOIN exam_proctors epc ON epc.exam_session_id = es.id
         WHERE epc.proctor_user_id = $1
         ORDER BY es.scheduled_start_at DESC`,
        [actor.sub],
      );
      return res.rows;
    }

    if (actor.roles.includes('SUPERVISOR')) {
      const res = await this.db.query(
        `SELECT es.*, e.title AS exam_title, e.code AS exam_code, e.browser_policy, e.camera_enabled,
                e.offline_grace_period_seconds, r.name AS room_name, r.code AS room_code,
                (SELECT COUNT(*)::int FROM exam_participants ep WHERE ep.exam_session_id = es.id) AS total_participants
         FROM exam_sessions es
         JOIN exams e ON e.id = es.exam_id
         JOIN rooms r ON r.id = es.room_id
         JOIN exam_supervisors esv ON esv.exam_session_id = es.id
         WHERE esv.supervisor_user_id = $1
         ORDER BY es.scheduled_start_at DESC`,
        [actor.sub],
      );
      return res.rows;
    }

    // Teacher
    const res = await this.db.query(
      `SELECT es.*, e.title AS exam_title, e.code AS exam_code, r.name AS room_name, r.code AS room_code,
              (SELECT COUNT(*)::int FROM exam_participants ep WHERE ep.exam_session_id = es.id) AS total_participants
       FROM exam_sessions es
       JOIN exams e ON e.id = es.exam_id
       JOIN rooms r ON r.id = es.room_id
       WHERE e.school_id = $1 AND e.created_by = $2
       ORDER BY es.scheduled_start_at DESC`,
      [actor.schoolId, actor.sub],
    );
    return res.rows;
  }

  async createSession(
    actor: SessionTokenPayload,
    dto: {
      examId: string;
      roomId: string;
      title: string;
      accessToken?: string;
      scheduledStartAt: string;
      scheduledEndAt: string;
      proctorUserIds?: string[];
      supervisorUserIds?: string[];
      classIdsToEnroll?: string[];
      studentUserIdsToEnroll?: string[];
    },
  ) {
    if (!dto.examId || !dto.roomId || !dto.title || !dto.scheduledStartAt || !dto.scheduledEndAt) {
      throw new BadRequestException('examId, roomId, title, scheduledStartAt, dan scheduledEndAt wajib diisi');
    }

    const sessionId = crypto.randomUUID();
    const accessToken = (dto.accessToken || crypto.randomBytes(3).toString('hex')).toUpperCase();

    await this.db.withTransaction(async (tx) => {
      await tx.query(
        `INSERT INTO exam_sessions (id, exam_id, room_id, title, access_token, status, scheduled_start_at, scheduled_end_at)
         VALUES ($1, $2, $3, $4, $5, 'READY', $6, $7)`,
        [
          sessionId,
          dto.examId,
          dto.roomId,
          dto.title,
          accessToken,
          dto.scheduledStartAt,
          dto.scheduledEndAt,
        ],
      );

      if (dto.proctorUserIds?.length) {
        for (const pId of dto.proctorUserIds) {
          await tx.query(
            `INSERT INTO exam_proctors (id, exam_session_id, proctor_user_id)
             VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
            [crypto.randomUUID(), sessionId, pId],
          );
        }
      }

      if (dto.supervisorUserIds?.length) {
        for (const sId of dto.supervisorUserIds) {
          await tx.query(
            `INSERT INTO exam_supervisors (id, exam_session_id, room_id, supervisor_user_id)
             VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
            [crypto.randomUUID(), sessionId, dto.roomId, sId],
          );
        }
      }

      if (dto.classIdsToEnroll?.length) {
        for (const classId of dto.classIdsToEnroll) {
          const members = await tx.query<{ user_id: string }>(
            `SELECT user_id FROM class_memberships WHERE class_id = $1 AND membership_role = 'STUDENT'`,
            [classId],
          );
          for (const m of members.rows) {
            await tx.query(
              `INSERT INTO exam_participants (id, exam_session_id, exam_id, student_user_id, class_id, status)
               VALUES ($1, $2, $3, $4, $5, 'READY')
               ON CONFLICT (exam_session_id, student_user_id) DO NOTHING`,
              [crypto.randomUUID(), sessionId, dto.examId, m.user_id, classId],
            );
          }
        }
      }

      if (dto.studentUserIdsToEnroll?.length) {
        for (const studentId of dto.studentUserIdsToEnroll) {
          await tx.query(
            `INSERT INTO exam_participants (id, exam_session_id, exam_id, student_user_id, status)
             VALUES ($1, $2, $3, $4, 'READY')
             ON CONFLICT (exam_session_id, student_user_id) DO NOTHING`,
            [crypto.randomUUID(), sessionId, dto.examId, studentId],
          );
        }
      }
    });

    await this.audit.log({
      schoolId: actor.schoolId,
      actorUserId: actor.sub,
      actorRole: actor.roles.join(','),
      action: 'EXAM_SESSION_CREATED',
      targetType: 'EXAM_SESSION',
      targetId: sessionId,
      metadata: { examId: dto.examId, roomId: dto.roomId, title: dto.title },
    });

    return { id: sessionId, accessToken, status: 'READY', ...dto };
  }
}
