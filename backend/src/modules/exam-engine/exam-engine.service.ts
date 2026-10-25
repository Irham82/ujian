import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { AuditService } from '../../common/audit.service';
import { deterministicShuffle, SessionTokenPayload } from '../../common/crypto.util';
import { GradingService } from '../grading/grading.service';
import * as crypto from 'crypto';

export function detectPlatformAndSeb(
  userAgent: string,
  sebConfigKeyHeader?: string,
  sebRequestHashHeader?: string,
): {
  osPlatform: 'WINDOWS' | 'MACOS' | 'IOS' | 'ANDROID' | 'OTHER';
  isSebUserAgent: boolean;
  sebHeaderPresent: boolean;
  sebSupportedOnPlatform: boolean;
} {
  const ua = (userAgent || '').toLowerCase();
  let osPlatform: 'WINDOWS' | 'MACOS' | 'IOS' | 'ANDROID' | 'OTHER' = 'OTHER';
  if (ua.includes('android')) {
    osPlatform = 'ANDROID';
  } else if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) {
    osPlatform = 'IOS';
  } else if (ua.includes('windows')) {
    osPlatform = 'WINDOWS';
  } else if (ua.includes('macintosh') || ua.includes('mac os x')) {
    osPlatform = 'MACOS';
  }

  const isSebUserAgent = ua.includes('seb/') || ua.includes('safeexambrowser');
  const sebHeaderPresent = Boolean(sebConfigKeyHeader || sebRequestHashHeader);
  // Safe Exam Browser officially supports Windows, macOS, and iOS; Android is NOT officially supported by SEB
  const sebSupportedOnPlatform = ['WINDOWS', 'MACOS', 'IOS'].includes(osPlatform);

  return {
    osPlatform,
    isSebUserAgent,
    sebHeaderPresent,
    sebSupportedOnPlatform,
  };
}

@Injectable()
export class ExamEngineService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(GradingService) private readonly gradingService: GradingService,
  ) {}

  private async verifyStudentParticipantOwnership(
    studentUser: SessionTokenPayload,
    participantId: string,
  ) {
    const res = await this.db.query<{
      id: string;
      exam_session_id: string;
      exam_id: string;
      student_user_id: string;
      status: string;
      question_order: any;
      option_orders: any;
      started_at: string | null;
      server_deadline_at: string | null;
      extra_time_seconds: number;
      submitted_at: string | null;
      session_binding_token: string | null;
      seb_verified: boolean;
      seb_override_by_proctor_id: string | null;
      camera_consent_given: boolean;
      camera_alternative_approved: boolean;
      connection_status: string;
      offline_since_at: string | null;
      unsynced_answers_count: number;
      final_score: string | null;
      duration_minutes: number;
      randomize_questions: boolean;
      randomize_options: boolean;
      browser_policy: string;
      seb_config_key_hash: string | null;
      camera_enabled: boolean;
      camera_retention_days: number;
      offline_enabled: boolean;
      offline_grace_period_seconds: number;
      max_offline_unsynced_answers: number;
      conflict_policy: string;
      publish_results: boolean;
      exam_title: string;
      exam_code: string;
      instructions_html: string;
      school_timezone: string;
    }>(
      `SELECT ep.*,
              e.duration_minutes, e.randomize_questions, e.randomize_options,
              e.browser_policy, e.seb_config_key_hash, e.camera_enabled, e.camera_retention_days,
              e.offline_enabled, e.offline_grace_period_seconds, e.max_offline_unsynced_answers,
              e.conflict_policy, e.publish_results, e.title AS exam_title, e.code AS exam_code,
              e.instructions_html, s.timezone AS school_timezone
       FROM exam_participants ep
       JOIN exams e ON e.id = ep.exam_id
       JOIN schools s ON s.id = e.school_id
       WHERE ep.id = $1`,
      [participantId],
    );

    if (res.rows.length === 0) {
      throw new NotFoundException('Sesi peserta ujian tidak ditemukan');
    }

    const part = res.rows[0];
    if (part.student_user_id !== studentUser.sub) {
      await this.audit.log({
        schoolId: studentUser.schoolId,
        actorUserId: studentUser.sub,
        actorRole: studentUser.roles.join(','),
        action: 'UNAUTHORIZED_PARTICIPANT_ACCESS',
        targetType: 'EXAM_PARTICIPANT',
        targetId: participantId,
        metadata: { ownerStudentId: part.student_user_id },
      });
      await this.db.query(
        `INSERT INTO anti_cheating_events (
          id, exam_session_id, exam_participant_id, event_type, classification, metadata
        ) VALUES ($1, $2, $3, 'UNAUTHORIZED_ACCESS', 'SECURITY_INCIDENT', $4)`,
        [
          crypto.randomUUID(),
          part.exam_session_id,
          part.id,
          JSON.stringify({ attemptedByUserId: studentUser.sub }),
        ],
      );
      throw new ForbiddenException('Anda dilarang mengakses sesi atau jawaban peserta lain');
    }

    return part;
  }

  private computeRemainingSeconds(
    serverDeadlineAt: string | null,
    extraTimeSeconds = 0,
  ): { effectiveDeadlineMs: number; remainingSeconds: number; isExpired: boolean } {
    if (!serverDeadlineAt) {
      return { effectiveDeadlineMs: 0, remainingSeconds: 0, isExpired: false };
    }
    const baseMs = new Date(serverDeadlineAt).getTime();
    const effectiveDeadlineMs = baseMs + Number(extraTimeSeconds || 0) * 1000;
    const remainingSeconds = Math.max(0, Math.floor((effectiveDeadlineMs - Date.now()) / 1000));
    return {
      effectiveDeadlineMs,
      remainingSeconds,
      isExpired: Date.now() > effectiveDeadlineMs,
    };
  }

  async listStudentExams(studentUser: SessionTokenPayload) {
    const res = await this.db.query(
      `SELECT ep.id AS participant_id, ep.status AS participant_status,
              ep.started_at, ep.server_deadline_at, ep.extra_time_seconds, ep.submitted_at,
              ep.seb_verified, ep.seb_override_by_proctor_id,
              ep.camera_consent_given, ep.camera_alternative_approved,
              CASE WHEN e.publish_results AND ep.status = 'SUBMITTED' THEN ep.final_score ELSE NULL END AS published_score,
              es.id AS session_id, es.title AS session_title, es.scheduled_start_at, es.scheduled_end_at,
              r.name AS room_name, r.code AS room_code,
              e.id AS exam_id, e.title AS exam_title, e.code AS exam_code,
              e.duration_minutes, e.browser_policy, e.camera_enabled, e.camera_retention_days,
              e.offline_enabled, e.offline_grace_period_seconds, e.max_offline_unsynced_answers,
              e.publish_results, e.instructions_html,
              sub.name AS subject_name, sub.code AS subject_code
       FROM exam_participants ep
       JOIN exam_sessions es ON es.id = ep.exam_session_id
       JOIN rooms r ON r.id = es.room_id
       JOIN exams e ON e.id = ep.exam_id
       JOIN subjects sub ON sub.id = e.subject_id
       WHERE ep.student_user_id = $1 AND e.school_id = $2
       ORDER BY es.scheduled_start_at DESC`,
      [studentUser.sub, studentUser.schoolId],
    );

    return {
      serverTimeUtc: new Date().toISOString(),
      exams: res.rows,
    };
  }

  async checkDeviceCompatibility(
    studentUser: SessionTokenPayload,
    sessionId: string,
    dto: {
      userAgent?: string;
      sebConfigKeyHash?: string;
      sebRequestHash?: string;
      indexedDbSupported?: boolean;
      cameraAvailable?: boolean;
      cameraConsentGiven?: boolean;
      screenWidth?: number;
      screenHeight?: number;
    },
  ) {
    const partRes = await this.db.query<{
      id: string;
      exam_id: string;
      seb_override_by_proctor_id: string | null;
      camera_alternative_approved: boolean;
      browser_policy: string;
      seb_config_key_hash: string | null;
      camera_enabled: boolean;
      camera_retention_days: number;
      offline_enabled: boolean;
      offline_grace_period_seconds: number;
    }>(
      `SELECT ep.id, ep.exam_id, ep.seb_override_by_proctor_id, ep.camera_alternative_approved,
              e.browser_policy, e.seb_config_key_hash, e.camera_enabled, e.camera_retention_days,
              e.offline_enabled, e.offline_grace_period_seconds
       FROM exam_participants ep
       JOIN exams e ON e.id = ep.exam_id
       WHERE ep.exam_session_id = $1 AND ep.student_user_id = $2`,
      [sessionId, studentUser.sub],
    );

    if (partRes.rows.length === 0) {
      throw new NotFoundException('Anda tidak terdaftar pada sesi ujian ini');
    }

    const part = partRes.rows[0];
    const detection = detectPlatformAndSeb(
      dto.userAgent || '',
      dto.sebConfigKeyHash,
      dto.sebRequestHash,
    );

    let sebVerified = false;
    if (detection.isSebUserAgent || detection.sebHeaderPresent) {
      if (part.seb_config_key_hash) {
        sebVerified = dto.sebConfigKeyHash === part.seb_config_key_hash;
      } else {
        sebVerified = true;
      }
    }

    const hasProctorSebOverride = Boolean(part.seb_override_by_proctor_id);
    const browserPolicyMet =
      part.browser_policy !== 'SECURE_BROWSER_REQUIRED' || sebVerified || hasProctorSebOverride;

    let cameraPolicyMet = true;
    if (part.camera_enabled) {
      if (dto.cameraAvailable === false || dto.cameraConsentGiven === false) {
        await this.db.query(
          `INSERT INTO anti_cheating_events (
            id, exam_session_id, exam_participant_id, event_type, classification, metadata
          ) VALUES ($1, $2, $3, 'CAMERA_UNAVAILABLE', 'ATTENTION', $4)`,
          [
            crypto.randomUUID(),
            sessionId,
            part.id,
            JSON.stringify({
              cameraAvailable: dto.cameraAvailable,
              cameraConsentGiven: dto.cameraConsentGiven,
            }),
          ],
        );
        cameraPolicyMet = Boolean(part.camera_alternative_approved);
      } else {
        cameraPolicyMet = Boolean(dto.cameraConsentGiven);
      }
    }

    await this.db.query(
      `UPDATE exam_participants
       SET device_info = $2,
           seb_verified = $3,
           camera_consent_given = COALESCE($4, camera_consent_given),
           updated_at = NOW()
       WHERE id = $1`,
      [
        part.id,
        JSON.stringify({
          osPlatform: detection.osPlatform,
          isSebUserAgent: detection.isSebUserAgent,
          indexedDbSupported: dto.indexedDbSupported ?? true,
          cameraAvailable: dto.cameraAvailable ?? false,
          screenWidth: dto.screenWidth || null,
          screenHeight: dto.screenHeight || null,
          checkedAt: new Date().toISOString(),
        }),
        sebVerified,
        dto.cameraConsentGiven ?? null,
      ],
    );

    return {
      participantId: part.id,
      sessionId,
      osPlatform: detection.osPlatform,
      browserPolicy: part.browser_policy,
      sebSupportedOnPlatform: detection.sebSupportedOnPlatform,
      sebVerified,
      hasProctorSebOverride,
      browserPolicyMet,
      standardBrowserLimitationNotice:
        part.browser_policy === 'STANDARD_BROWSER' || !sebVerified
          ? 'Browser standar tidak mengunci seluruh perangkat di tingkat sistem operasi. Sistem mencatat perpindahan fokus/tab untuk ditinjau proktor.'
          : null,
      cameraPolicy: {
        cameraEnabled: part.camera_enabled,
        retentionDays: part.camera_retention_days,
        purpose:
          'Verifikasi kehadiran dan integritas pengerjaan ujian sesuai kebijakan sekolah (tanpa merekam audio dan tanpa keputusan sanksi otomatis).',
        authorizedAccessRoles: ['ADMIN', 'PROCTOR'],
        alternativeProcedure:
          'Jika perangkat tidak memiliki kamera atau izin ditolak, hubungi Pengawas/Proktor ruang untuk persetujuan pengawasan fisik langsung.',
        cameraConsentGiven: Boolean(dto.cameraConsentGiven),
        cameraAlternativeApproved: part.camera_alternative_approved,
        cameraPolicyMet,
      },
      offlinePolicy: {
        offlineEnabled: part.offline_enabled,
        offlineGracePeriodSeconds: part.offline_grace_period_seconds,
        indexedDbSupported: dto.indexedDbSupported ?? true,
      },
      allowedToStart: browserPolicyMet && cameraPolicyMet,
    };
  }

  async startOrResumeExam(
    studentUser: SessionTokenPayload,
    sessionId: string,
    headers: {
      userAgent?: string;
      sebConfigKeyHash?: string;
      sebRequestHash?: string;
    },
  ) {
    const partRes = await this.db.query<{
      id: string;
      exam_id: string;
      status: string;
      question_order: any;
      option_orders: any;
      started_at: string | null;
      server_deadline_at: string | null;
      extra_time_seconds: number;
      seb_verified: boolean;
      seb_override_by_proctor_id: string | null;
      camera_consent_given: boolean;
      camera_alternative_approved: boolean;
      duration_minutes: number;
      randomize_questions: boolean;
      randomize_options: boolean;
      browser_policy: string;
      seb_config_key_hash: string | null;
      camera_enabled: boolean;
      exam_status: string;
      session_status: string;
      scheduled_start_at: string;
      scheduled_end_at: string;
    }>(
      `SELECT ep.*,
              e.duration_minutes, e.randomize_questions, e.randomize_options,
              e.browser_policy, e.seb_config_key_hash, e.camera_enabled, e.status AS exam_status,
              es.status AS session_status, es.scheduled_start_at, es.scheduled_end_at
       FROM exam_participants ep
       JOIN exams e ON e.id = ep.exam_id
       JOIN exam_sessions es ON es.id = ep.exam_session_id
       WHERE ep.exam_session_id = $1 AND ep.student_user_id = $2`,
      [sessionId, studentUser.sub],
    );

    if (partRes.rows.length === 0) {
      throw new ForbiddenException('Anda tidak terdaftar sebagai peserta pada sesi ujian ini');
    }

    const part = partRes.rows[0];
    if (['SUBMITTED', 'EXPIRED', 'CANCELLED'].includes(part.status)) {
      throw new ConflictException(`Sesi ujian Anda sudah berstatus ${part.status} dan tidak dapat dimulai ulang`);
    }
    if (part.status === 'PAUSED') {
      throw new ForbiddenException('Sesi ujian Anda sedang dijeda oleh Proktor. Menunggu otorisasi Proktor.');
    }

    const nowMs = Date.now();
    if (nowMs < new Date(part.scheduled_start_at).getTime()) {
      throw new ForbiddenException('Jadwal sesi ujian belum dimulai menurut waktu server');
    }
    if (nowMs > new Date(part.scheduled_end_at).getTime()) {
      throw new ForbiddenException('Jadwal sesi ujian telah berakhir menurut waktu server');
    }

    // Verify SEB requirement if SECURE_BROWSER_REQUIRED
    const detection = detectPlatformAndSeb(
      headers.userAgent || '',
      headers.sebConfigKeyHash,
      headers.sebRequestHash,
    );
    const sebOk =
      part.seb_verified ||
      Boolean(part.seb_override_by_proctor_id) ||
      (detection.isSebUserAgent &&
        (!part.seb_config_key_hash || headers.sebConfigKeyHash === part.seb_config_key_hash)) ||
      (detection.sebHeaderPresent &&
        (!part.seb_config_key_hash || headers.sebConfigKeyHash === part.seb_config_key_hash));

    if (part.browser_policy === 'SECURE_BROWSER_REQUIRED' && !sebOk) {
      await this.audit.log({
        schoolId: studentUser.schoolId,
        actorUserId: studentUser.sub,
        actorRole: 'STUDENT',
        action: 'SEB_POLICY_REJECTED',
        targetType: 'EXAM_PARTICIPANT',
        targetId: part.id,
        metadata: { osPlatform: detection.osPlatform, isSebUserAgent: detection.isSebUserAgent },
      });
      throw new ForbiddenException(
        'Ujian ini mewajibkan Safe Exam Browser (SECURE_BROWSER_REQUIRED). Gunakan perangkat yang kompatibel atau minta pengecualian resmi dari Proktor.',
      );
    }

    // Verify optional camera consent or approved alternative if camera_enabled
    if (
      part.camera_enabled &&
      !part.camera_consent_given &&
      !part.camera_alternative_approved
    ) {
      throw new ForbiddenException(
        'Ujian ini mengaktifkan kamera opsional. Harap berikan persetujuan kamera pada halaman Pemeriksaan Perangkat atau minta persetujuan prosedur alternatif dari Pengawas/Proktor.',
      );
    }

    // Resume if already IN_PROGRESS
    if (part.status === 'IN_PROGRESS' && part.started_at && part.server_deadline_at) {
      const timeInfo = this.computeRemainingSeconds(part.server_deadline_at, part.extra_time_seconds);
      if (timeInfo.isExpired) {
        await this.db.query(
          `UPDATE exam_participants SET status = 'EXPIRED', updated_at = NOW() WHERE id = $1`,
          [part.id],
        );
        throw new ConflictException('Waktu pengerjaan ujian Anda telah habis (EXPIRED)');
      }

      await this.db.query(
        `UPDATE exam_participants
         SET session_binding_token = $2,
             connection_status = 'ONLINE',
             offline_since_at = NULL,
             last_heartbeat_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [part.id, studentUser.sid],
      );

      await this.db.query(
        `INSERT INTO anti_cheating_events (
          id, exam_session_id, exam_participant_id, event_type, classification, metadata
        ) VALUES ($1, $2, $3, 'EXAM_RESUMED', 'INFORMATION', $4)`,
        [
          crypto.randomUUID(),
          sessionId,
          part.id,
          JSON.stringify({ remainingSeconds: timeInfo.remainingSeconds }),
        ],
      );

      return {
        participantId: part.id,
        sessionId,
        examId: part.exam_id,
        status: 'IN_PROGRESS',
        resumed: true,
        startedAtUtc: part.started_at,
        serverDeadlineUtc: new Date(timeInfo.effectiveDeadlineMs).toISOString(),
        serverNowUtc: new Date().toISOString(),
        remainingSeconds: timeInfo.remainingSeconds,
      };
    }

    // First-time start: generate deterministic question & option order
    const eqRes = await this.db.query<{ question_id: string; question_snapshot: any }>(
      `SELECT question_id, question_snapshot FROM exam_questions WHERE exam_id = $1 ORDER BY order_no ASC`,
      [part.exam_id],
    );
    const rawQuestionIds = eqRes.rows.map((r) => r.question_id);
    const questionOrder = part.randomize_questions
      ? deterministicShuffle(rawQuestionIds, `${part.id}:questions`)
      : rawQuestionIds;

    const optionOrders: Record<string, string[]> = {};
    for (const row of eqRes.rows) {
      const snap =
        typeof row.question_snapshot === 'string'
          ? JSON.parse(row.question_snapshot)
          : row.question_snapshot;
      const optKeys: string[] = Array.isArray(snap.options)
        ? snap.options.map((o: any) => String(o.key))
        : [];
      if (optKeys.length > 0) {
        optionOrders[row.question_id] =
          part.randomize_options && snap.type !== 'TRUE_FALSE'
            ? deterministicShuffle(optKeys, `${part.id}:options:${row.question_id}`)
            : optKeys;
      }
    }

    const startedAt = new Date();
    const deadlineAt = new Date(
      startedAt.getTime() + Number(part.duration_minutes || 90) * 60 * 1000,
    );

    await this.db.query(
      `UPDATE exam_participants
       SET status = 'IN_PROGRESS',
           question_order = $2,
           option_orders = $3,
           started_at = $4,
           server_deadline_at = $5,
           session_binding_token = $6,
           seb_verified = $7,
           connection_status = 'ONLINE',
           last_heartbeat_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [
        part.id,
        JSON.stringify(questionOrder),
        JSON.stringify(optionOrders),
        startedAt.toISOString(),
        deadlineAt.toISOString(),
        studentUser.sid,
        sebOk,
      ],
    );

    await this.audit.log({
      schoolId: studentUser.schoolId,
      actorUserId: studentUser.sub,
      actorRole: 'STUDENT',
      action: 'EXAM_STARTED',
      targetType: 'EXAM_PARTICIPANT',
      targetId: part.id,
      metadata: {
        sessionId,
        examId: part.exam_id,
        startedAtUtc: startedAt.toISOString(),
        deadlineAtUtc: deadlineAt.toISOString(),
      },
    });

    const timeInfo = this.computeRemainingSeconds(deadlineAt.toISOString(), part.extra_time_seconds);
    return {
      participantId: part.id,
      sessionId,
      examId: part.exam_id,
      status: 'IN_PROGRESS',
      resumed: false,
      startedAtUtc: startedAt.toISOString(),
      serverDeadlineUtc: new Date(timeInfo.effectiveDeadlineMs).toISOString(),
      serverNowUtc: new Date().toISOString(),
      remainingSeconds: timeInfo.remainingSeconds,
    };
  }

  /**
   * Returns student exam paper WITHOUT answer_key, is_correct, or explanation_html.
   */
  async getParticipantPaper(studentUser: SessionTokenPayload, participantId: string) {
    const part = await this.verifyStudentParticipantOwnership(studentUser, participantId);
    if (!['IN_PROGRESS', 'PAUSED', 'SUBMITTED', 'EXPIRED'].includes(part.status)) {
      throw new ForbiddenException('Sesi ujian belum dimulai');
    }

    const timeInfo = this.computeRemainingSeconds(part.server_deadline_at, part.extra_time_seconds);
    if (part.status === 'IN_PROGRESS' && timeInfo.isExpired) {
      await this.db.query(
        `UPDATE exam_participants SET status = 'EXPIRED', updated_at = NOW() WHERE id = $1`,
        [part.id],
      );
      part.status = 'EXPIRED';
    }

    const eqRes = await this.db.query<{
      question_id: string;
      question_version: number;
      question_snapshot: any;
      order_no: number;
      weight: string;
    }>(
      `SELECT question_id, question_version, question_snapshot, order_no, weight
       FROM exam_questions
       WHERE exam_id = $1`,
      [part.exam_id],
    );

    const eqById = new Map<string, any>();
    for (const row of eqRes.rows) {
      eqById.set(row.question_id, row);
    }

    const questionOrder: string[] =
      Array.isArray(part.question_order) && part.question_order.length > 0
        ? part.question_order
        : eqRes.rows.map((r) => r.question_id);

    const optionOrders: Record<string, string[]> =
      part.option_orders && typeof part.option_orders === 'object' ? part.option_orders : {};

    const savedAnswersRes = await this.db.query<{
      question_id: string;
      answer_payload: any;
      is_marked_for_review: boolean;
      answer_version: number;
      last_idempotency_key: string;
      server_saved_at: string;
    }>(
      `SELECT question_id, answer_payload, is_marked_for_review, answer_version, last_idempotency_key, server_saved_at
       FROM participant_answers
       WHERE exam_participant_id = $1`,
      [part.id],
    );

    const savedMap = new Map<string, any>();
    for (const ans of savedAnswersRes.rows) {
      savedMap.set(ans.question_id, {
        questionId: ans.question_id,
        answerPayload: ans.answer_payload,
        isMarkedForReview: ans.is_marked_for_review,
        answerVersion: ans.answer_version,
        lastIdempotencyKey: ans.last_idempotency_key,
        serverSavedAt: ans.server_saved_at,
        syncStatus: 'SAVED_ON_SERVER',
      });
    }

    // Build sanitized student questions (NEVER include answerKey, isCorrect, or explanation)
    const sanitizedQuestions = questionOrder
      .map((qId, idx) => {
        const eq = eqById.get(qId);
        if (!eq) return null;
        const snap =
          typeof eq.question_snapshot === 'string'
            ? JSON.parse(eq.question_snapshot)
            : eq.question_snapshot;

        const rawOpts: any[] = Array.isArray(snap.options) ? snap.options : [];
        const optByKey = new Map<string, any>();
        for (const o of rawOpts) {
          optByKey.set(String(o.key), o);
        }

        const orderedKeys = optionOrders[qId] || rawOpts.map((o) => String(o.key));
        const sanitizedOptions = orderedKeys
          .map((k) => {
            const o = optByKey.get(k);
            if (!o) return null;
            return {
              optionKey: o.key,
              contentHtml: o.html,
            };
          })
          .filter(Boolean);

        return {
          number: idx + 1,
          questionId: qId,
          questionVersion: eq.question_version,
          questionType: snap.type,
          stemHtml: snap.stem,
          formulaLatex: snap.formula || null,
          weight: Number(eq.weight || snap.weight || 1),
          options: sanitizedOptions,
          savedAnswer: savedMap.get(qId) || null,
        };
      })
      .filter(Boolean);

    return {
      participantId: part.id,
      sessionId: part.exam_session_id,
      examId: part.exam_id,
      examTitle: part.exam_title,
      examCode: part.exam_code,
      instructionsHtml: part.instructions_html,
      schoolTimezone: part.school_timezone,
      status: part.status,
      startedAtUtc: part.started_at,
      serverDeadlineUtc: part.server_deadline_at
        ? new Date(timeInfo.effectiveDeadlineMs).toISOString()
        : null,
      serverNowUtc: new Date().toISOString(),
      remainingSeconds: timeInfo.remainingSeconds,
      offlinePolicy: {
        offlineEnabled: part.offline_enabled,
        offlineGracePeriodSeconds: part.offline_grace_period_seconds,
        maxOfflineUnsyncedAnswers: part.max_offline_unsynced_answers,
      },
      questions: sanitizedQuestions,
    };
  }

  async saveAnswer(
    studentUser: SessionTokenPayload,
    participantId: string,
    dto: {
      questionId: string;
      answerPayload: Record<string, any>;
      isMarkedForReview?: boolean;
      idempotencyKey: string;
      expectedVersion?: number;
      clientUpdatedAt?: string;
    },
  ) {
    if (!dto.questionId || !dto.idempotencyKey || dto.answerPayload === undefined) {
      throw new BadRequestException('questionId, answerPayload, dan idempotencyKey wajib diisi');
    }

    const part = await this.verifyStudentParticipantOwnership(studentUser, participantId);

    if (part.status !== 'IN_PROGRESS') {
      throw new ConflictException(
        `Perubahan jawaban ditolak karena status sesi ujian adalah ${part.status}`,
      );
    }

    const timeInfo = this.computeRemainingSeconds(part.server_deadline_at, part.extra_time_seconds);
    if (timeInfo.isExpired) {
      await this.db.query(
        `UPDATE exam_participants SET status = 'EXPIRED', updated_at = NOW() WHERE id = $1`,
        [part.id],
      );
      throw new ConflictException(
        'Batas waktu ujian di server telah berakhir (EXPIRED). Perubahan jawaban ditolak.',
      );
    }

    // Verify question belongs to this exam
    const eqCheck = await this.db.query(
      'SELECT 1 FROM exam_questions WHERE exam_id = $1 AND question_id = $2',
      [part.exam_id, dto.questionId],
    );
    if (eqCheck.rows.length === 0) {
      throw new ForbiddenException('Soal ini bukan bagian dari paket ujian Anda');
    }

    const result = await this.db.withTransaction(async (tx) => {
      // 1. Check idempotency key in answer_events
      const existingEvent = await tx.query<{
        answer_version: number;
        new_payload: any;
        is_marked_for_review: boolean;
        created_at: string;
      }>(
        `SELECT answer_version, new_payload, is_marked_for_review, created_at
         FROM answer_events
         WHERE idempotency_key = $1`,
        [dto.idempotencyKey],
      );

      if (existingEvent.rows.length > 0) {
        const ev = existingEvent.rows[0];
        return {
          status: 'SAVED_ON_SERVER',
          idempotentReplay: true,
          questionId: dto.questionId,
          answerVersion: ev.answer_version,
          isMarkedForReview: ev.is_marked_for_review,
          serverSavedAt: ev.created_at,
          conflictDetected: false,
        };
      }

      // 2. Check existing participant_answers row
      const existingAns = await tx.query<{
        id: string;
        answer_payload: any;
        answer_version: number;
        is_marked_for_review: boolean;
        server_saved_at: string;
      }>(
        `SELECT id, answer_payload, answer_version, is_marked_for_review, server_saved_at
         FROM participant_answers
         WHERE exam_participant_id = $1 AND question_id = $2`,
        [part.id, dto.questionId],
      );

      let participantAnswerId: string;
      let nextVersion = 1;
      let previousPayload: any = null;
      let conflictDetected = false;
      let conflictResolution: string | null = null;
      let payloadToPersist = dto.answerPayload;

      if (existingAns.rows.length === 0) {
        participantAnswerId = crypto.randomUUID();
        await tx.query(
          `INSERT INTO participant_answers (
            id, exam_participant_id, question_id, answer_payload, is_marked_for_review,
            answer_version, last_idempotency_key, sync_source, client_updated_at, server_saved_at
          ) VALUES ($1, $2, $3, $4, $5, 1, $6, 'ONLINE', $7, NOW())`,
          [
            participantAnswerId,
            part.id,
            dto.questionId,
            JSON.stringify(payloadToPersist),
            Boolean(dto.isMarkedForReview),
            dto.idempotencyKey,
            dto.clientUpdatedAt || new Date().toISOString(),
          ],
        );
      } else {
        const current = existingAns.rows[0];
        participantAnswerId = current.id;
        previousPayload = current.answer_payload;
        nextVersion = Number(current.answer_version) + 1;

        if (
          typeof dto.expectedVersion === 'number' &&
          dto.expectedVersion < Number(current.answer_version)
        ) {
          conflictDetected = true;
          if (part.conflict_policy === 'SERVER_WINS_LOG_BOTH') {
            payloadToPersist = current.answer_payload;
            conflictResolution = 'SERVER_WINS_KEPT_SERVER_VERSION';
          } else {
            payloadToPersist = dto.answerPayload;
            conflictResolution = 'LATEST_VALID_APPLIED_LOGGED_PREVIOUS';
          }
        }

        await tx.query(
          `UPDATE participant_answers
           SET answer_payload = $3,
               is_marked_for_review = $4,
               answer_version = $5,
               last_idempotency_key = $6,
               sync_source = 'ONLINE',
               client_updated_at = $7,
               server_saved_at = NOW()
           WHERE id = $1 AND exam_participant_id = $2`,
          [
            participantAnswerId,
            part.id,
            JSON.stringify(payloadToPersist),
            Boolean(dto.isMarkedForReview),
            nextVersion,
            dto.idempotencyKey,
            dto.clientUpdatedAt || new Date().toISOString(),
          ],
        );
      }

      const savedNow = new Date().toISOString();
      await tx.query(
        `INSERT INTO answer_events (
          id, participant_answer_id, exam_participant_id, question_id,
          idempotency_key, answer_version, previous_payload, new_payload,
          is_marked_for_review, sync_source, conflict_detected, conflict_resolution, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ONLINE', $10, $11, $12)`,
        [
          crypto.randomUUID(),
          participantAnswerId,
          part.id,
          dto.questionId,
          dto.idempotencyKey,
          nextVersion,
          previousPayload ? JSON.stringify(previousPayload) : null,
          JSON.stringify(payloadToPersist),
          Boolean(dto.isMarkedForReview),
          conflictDetected,
          conflictResolution,
          savedNow,
        ],
      );

      await tx.query(
        `UPDATE exam_participants
         SET connection_status = 'ONLINE',
             offline_since_at = NULL,
             last_heartbeat_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [part.id],
      );

      return {
        status: 'SAVED_ON_SERVER',
        idempotentReplay: false,
        questionId: dto.questionId,
        answerVersion: nextVersion,
        isMarkedForReview: Boolean(dto.isMarkedForReview),
        serverSavedAt: savedNow,
        conflictDetected,
        conflictResolution,
      };
    });

    return {
      ...result,
      serverNowUtc: new Date().toISOString(),
      remainingSeconds: timeInfo.remainingSeconds,
    };
  }

  /**
   * Sequential offline queue synchronization after reconnect.
   */
  async syncOfflineBatch(
    studentUser: SessionTokenPayload,
    participantId: string,
    dto: {
      batchIdempotencyKey: string;
      offlineDurationSeconds?: number;
      items: Array<{
        questionId: string;
        answerPayload: Record<string, any>;
        isMarkedForReview?: boolean;
        idempotencyKey: string;
        expectedVersion?: number;
        clientUpdatedAt?: string;
      }>;
    },
  ) {
    if (!dto.batchIdempotencyKey || !Array.isArray(dto.items)) {
      throw new BadRequestException('batchIdempotencyKey dan items[] wajib diisi');
    }

    const part = await this.verifyStudentParticipantOwnership(studentUser, participantId);

    // Check if batch was already synced idempotently
    const existingBatch = await this.db.query<{
      status: string;
      accepted_count: number;
      conflict_count: number;
      rejected_count: number;
      exceeded_grace_period: boolean;
      details: any;
      synced_at: string;
    }>(
      `SELECT status, accepted_count, conflict_count, rejected_count, exceeded_grace_period, details, synced_at
       FROM offline_sync_batches
       WHERE batch_idempotency_key = $1`,
      [dto.batchIdempotencyKey],
    );
    if (existingBatch.rows.length > 0) {
      const b = existingBatch.rows[0];
      return {
        idempotentReplay: true,
        batchIdempotencyKey: dto.batchIdempotencyKey,
        status: b.status,
        acceptedCount: b.accepted_count,
        conflictCount: b.conflict_count,
        rejectedCount: b.rejected_count,
        exceededGracePeriod: b.exceeded_grace_period,
        results: b.details,
        syncedAtUtc: b.synced_at,
      };
    }

    if (part.status === 'CANCELLED' || part.status === 'PAUSED') {
      await this.db.query(
        `INSERT INTO offline_sync_batches (
          id, exam_participant_id, batch_idempotency_key, items_count, rejected_count, status, details
        ) VALUES ($1, $2, $3, $4, $4, 'REJECTED_REVOKED', $5)`,
        [
          crypto.randomUUID(),
          part.id,
          dto.batchIdempotencyKey,
          dto.items.length,
          JSON.stringify({ reason: `Sesi berstatus ${part.status}` }),
        ],
      );
      throw new ForbiddenException(
        `Sinkronisasi ditolak karena sesi ujian Anda berstatus ${part.status}. Hubungi Proktor.`,
      );
    }

    if (part.status === 'SUBMITTED') {
      throw new ConflictException(
        'Sinkronisasi ditolak karena ujian telah dikumpulkan (SUBMITTED).',
      );
    }

    const timeInfo = this.computeRemainingSeconds(part.server_deadline_at, part.extra_time_seconds);
    const offlineDuration = Number(dto.offlineDurationSeconds || 0);
    const exceededGrace = offlineDuration > Number(part.offline_grace_period_seconds || 120);

    if (timeInfo.isExpired) {
      await this.db.query(
        `UPDATE exam_participants SET status = 'EXPIRED', needs_review = TRUE, updated_at = NOW() WHERE id = $1`,
        [part.id],
      );
      await this.db.query(
        `INSERT INTO offline_sync_batches (
          id, exam_participant_id, batch_idempotency_key, items_count, rejected_count,
          offline_duration_seconds, exceeded_grace_period, status, details
        ) VALUES ($1, $2, $3, $4, $4, $5, $6, 'REJECTED_EXPIRED', $7)`,
        [
          crypto.randomUUID(),
          part.id,
          dto.batchIdempotencyKey,
          dto.items.length,
          offlineDuration,
          exceededGrace,
          JSON.stringify({ reason: 'Server deadline expired while offline' }),
        ],
      );
      throw new ConflictException(
        'Batas waktu ujian server telah berakhir saat perangkat offline (REJECTED_EXPIRED). Hubungi Proktor untuk peninjauan.',
      );
    }

    if (dto.items.length > Number(part.max_offline_unsynced_answers || 100)) {
      throw new BadRequestException(
        `Jumlah jawaban dalam antrean offline (${dto.items.length}) melebihi batas kebijakan (${part.max_offline_unsynced_answers})`,
      );
    }

    const eqRes = await this.db.query<{ question_id: string }>(
      'SELECT question_id FROM exam_questions WHERE exam_id = $1',
      [part.exam_id],
    );
    const validQuestionIds = new Set(eqRes.rows.map((r) => r.question_id));

    let acceptedCount = 0;
    let conflictCount = 0;
    let rejectedCount = 0;
    const itemDetails: any[] = [];

    await this.db.withTransaction(async (tx) => {
      for (const item of dto.items) {
        if (!item.questionId || !item.idempotencyKey || !validQuestionIds.has(item.questionId)) {
          rejectedCount++;
          itemDetails.push({
            questionId: item.questionId,
            idempotencyKey: item.idempotencyKey,
            status: 'REJECTED_INVALID_QUESTION',
          });
          continue;
        }

        const dupEvent = await tx.query<{ answer_version: number; created_at: string }>(
          'SELECT answer_version, created_at FROM answer_events WHERE idempotency_key = $1',
          [item.idempotencyKey],
        );
        if (dupEvent.rows.length > 0) {
          acceptedCount++;
          itemDetails.push({
            questionId: item.questionId,
            idempotencyKey: item.idempotencyKey,
            status: 'SAVED_ON_SERVER',
            idempotentReplay: true,
            answerVersion: dupEvent.rows[0].answer_version,
            serverSavedAt: dupEvent.rows[0].created_at,
          });
          continue;
        }

        const existingAns = await tx.query<{
          id: string;
          answer_payload: any;
          answer_version: number;
        }>(
          `SELECT id, answer_payload, answer_version
           FROM participant_answers
           WHERE exam_participant_id = $1 AND question_id = $2`,
          [part.id, item.questionId],
        );

        let participantAnswerId: string;
        let nextVersion = 1;
        let previousPayload: any = null;
        let conflictDetected = false;
        let conflictResolution: string | null = null;
        let payloadToSave = item.answerPayload;

        if (existingAns.rows.length === 0) {
          participantAnswerId = crypto.randomUUID();
          await tx.query(
            `INSERT INTO participant_answers (
              id, exam_participant_id, question_id, answer_payload, is_marked_for_review,
              answer_version, last_idempotency_key, sync_source, client_updated_at, server_saved_at
            ) VALUES ($1, $2, $3, $4, $5, 1, $6, 'OFFLINE_SYNC', $7, NOW())`,
            [
              participantAnswerId,
              part.id,
              item.questionId,
              JSON.stringify(payloadToSave),
              Boolean(item.isMarkedForReview),
              item.idempotencyKey,
              item.clientUpdatedAt || new Date().toISOString(),
            ],
          );
        } else {
          const cur = existingAns.rows[0];
          participantAnswerId = cur.id;
          previousPayload = cur.answer_payload;
          nextVersion = Number(cur.answer_version) + 1;

          if (
            typeof item.expectedVersion === 'number' &&
            item.expectedVersion < Number(cur.answer_version)
          ) {
            conflictDetected = true;
            conflictCount++;
            if (part.conflict_policy === 'SERVER_WINS_LOG_BOTH') {
              payloadToSave = cur.answer_payload;
              conflictResolution = 'SERVER_WINS_KEPT_SERVER_VERSION';
            } else {
              payloadToSave = item.answerPayload;
              conflictResolution = 'LATEST_VALID_APPLIED_LOGGED_PREVIOUS';
            }
          }

          await tx.query(
            `UPDATE participant_answers
             SET answer_payload = $3,
                 is_marked_for_review = $4,
                 answer_version = $5,
                 last_idempotency_key = $6,
                 sync_source = 'OFFLINE_SYNC',
                 client_updated_at = $7,
                 server_saved_at = NOW()
             WHERE id = $1 AND exam_participant_id = $2`,
            [
              participantAnswerId,
              part.id,
              JSON.stringify(payloadToSave),
              Boolean(item.isMarkedForReview),
              nextVersion,
              item.idempotencyKey,
              item.clientUpdatedAt || new Date().toISOString(),
            ],
          );
        }

        const savedAt = new Date().toISOString();
        await tx.query(
          `INSERT INTO answer_events (
            id, participant_answer_id, exam_participant_id, question_id,
            idempotency_key, answer_version, previous_payload, new_payload,
            is_marked_for_review, sync_source, conflict_detected, conflict_resolution, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'OFFLINE_SYNC', $10, $11, $12)`,
          [
            crypto.randomUUID(),
            participantAnswerId,
            part.id,
            item.questionId,
            item.idempotencyKey,
            nextVersion,
            previousPayload ? JSON.stringify(previousPayload) : null,
            JSON.stringify(payloadToSave),
            Boolean(item.isMarkedForReview),
            conflictDetected,
            conflictResolution,
            savedAt,
          ],
        );

        acceptedCount++;
        itemDetails.push({
          questionId: item.questionId,
          idempotencyKey: item.idempotencyKey,
          status: 'SAVED_ON_SERVER',
          answerVersion: nextVersion,
          conflictDetected,
          conflictResolution,
          serverSavedAt: savedAt,
        });
      }

      const batchStatus = conflictCount > 0 ? 'PARTIAL_CONFLICT' : 'COMPLETED';
      await tx.query(
        `INSERT INTO offline_sync_batches (
          id, exam_participant_id, batch_idempotency_key, items_count,
          accepted_count, conflict_count, rejected_count,
          offline_duration_seconds, exceeded_grace_period, status, details
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          crypto.randomUUID(),
          part.id,
          dto.batchIdempotencyKey,
          dto.items.length,
          acceptedCount,
          conflictCount,
          rejectedCount,
          offlineDuration,
          exceededGrace,
          batchStatus,
          JSON.stringify(itemDetails),
        ],
      );

      if (conflictCount > 0) {
        await tx.query(
          `INSERT INTO anti_cheating_events (
            id, exam_session_id, exam_participant_id, event_type, classification, metadata
          ) VALUES ($1, $2, $3, 'OFFLINE_SYNC_CONFLICT', 'REVIEW_REQUIRED', $4)`,
          [
            crypto.randomUUID(),
            part.exam_session_id,
            part.id,
            JSON.stringify({
              batchIdempotencyKey: dto.batchIdempotencyKey,
              conflictCount,
              offlineDuration,
            }),
          ],
        );
      }

      await tx.query(
        `INSERT INTO anti_cheating_events (
          id, exam_session_id, exam_participant_id, event_type, classification, duration_ms, metadata
        ) VALUES ($1, $2, $3, 'OFFLINE_SYNC_COMPLETED', $4, $5, $6)`,
        [
          crypto.randomUUID(),
          part.exam_session_id,
          part.id,
          exceededGrace ? 'REVIEW_REQUIRED' : 'INFORMATION',
          offlineDuration * 1000,
          JSON.stringify({
            batchIdempotencyKey: dto.batchIdempotencyKey,
            acceptedCount,
            conflictCount,
            rejectedCount,
            exceededGracePeriod: exceededGrace,
          }),
        ],
      );

      await tx.query(
        `UPDATE exam_participants
         SET connection_status = 'ONLINE',
             offline_since_at = NULL,
             unsynced_answers_count = 0,
             needs_review = CASE WHEN $2 THEN TRUE ELSE needs_review END,
             last_heartbeat_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [part.id, exceededGrace || conflictCount > 0],
      );
    });

    return {
      idempotentReplay: false,
      batchIdempotencyKey: dto.batchIdempotencyKey,
      status: conflictCount > 0 ? 'PARTIAL_CONFLICT' : 'COMPLETED',
      acceptedCount,
      conflictCount,
      rejectedCount,
      exceededGracePeriod: exceededGrace,
      gracePeriodWarning: exceededGrace
        ? `Durasi offline (${offlineDuration} detik) melewati batas toleransi (${part.offline_grace_period_seconds} detik). Jawaban tetap disimpan dan sesi ditandai untuk ditinjau Proktor.`
        : null,
      results: itemDetails,
      syncedAtUtc: new Date().toISOString(),
      remainingSeconds: timeInfo.remainingSeconds,
    };
  }

  async recordHeartbeat(
    studentUser: SessionTokenPayload,
    participantId: string,
    dto: {
      connectionStatus?: 'ONLINE' | 'OFFLINE_WITHIN_GRACE' | 'OFFLINE_EXCEEDED_GRACE';
      unsyncedAnswersCount?: number;
      offlineDurationSeconds?: number;
    },
  ) {
    const part = await this.verifyStudentParticipantOwnership(studentUser, participantId);
    const timeInfo = this.computeRemainingSeconds(part.server_deadline_at, part.extra_time_seconds);
    const offlineSec = Number(dto.offlineDurationSeconds || 0);
    const exceeded = offlineSec > Number(part.offline_grace_period_seconds || 120);
    const connStatus =
      dto.connectionStatus ||
      (offlineSec > 0
        ? exceeded
          ? 'OFFLINE_EXCEEDED_GRACE'
          : 'OFFLINE_WITHIN_GRACE'
        : 'ONLINE');

    await this.db.query(
      `UPDATE exam_participants
       SET connection_status = $2,
           unsynced_answers_count = $3,
           needs_review = CASE WHEN $4 THEN TRUE ELSE needs_review END,
           last_heartbeat_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [part.id, connStatus, Number(dto.unsyncedAnswersCount || 0), exceeded],
    );

    return {
      participantId: part.id,
      status: part.status,
      serverNowUtc: new Date().toISOString(),
      remainingSeconds: timeInfo.remainingSeconds,
      isExpired: timeInfo.isExpired,
      connectionStatus: connStatus,
    };
  }

  /**
   * Idempotent final exam submission & grading trigger.
   * Repeated or parallel calls return the exact same submission without duplicate grading.
   */
  async submitExam(
    studentUser: SessionTokenPayload,
    participantId: string,
    dto: { idempotencyKey?: string },
  ) {
    const part = await this.verifyStudentParticipantOwnership(studentUser, participantId);
    const idemKey = dto.idempotencyKey || `submit:${part.id}`;

    const submissionResult = await this.db.withTransaction(async (tx) => {
      // Check if submission already exists for this participant or idempotencyKey
      const existingSub = await tx.query<{
        id: string;
        idempotency_key: string;
        submission_reason: string;
        auto_score: string;
        manual_score: string;
        total_score: string;
        max_possible_score: string;
        percentage_score: string;
        grading_status: string;
        submitted_at: string;
      }>(
        `SELECT id, idempotency_key, submission_reason, auto_score, manual_score,
                total_score, max_possible_score, percentage_score, grading_status, submitted_at
         FROM exam_submissions
         WHERE exam_participant_id = $1 OR idempotency_key = $2
         LIMIT 1`,
        [part.id, idemKey],
      );

      if (existingSub.rows.length > 0) {
        const s = existingSub.rows[0];
        return {
          idempotentReplay: true,
          submissionId: s.id,
          participantId: part.id,
          status: 'SUBMITTED',
          submissionReason: s.submission_reason,
          gradingStatus: s.grading_status,
          submittedAtUtc: s.submitted_at,
          score: part.publish_results
            ? {
                autoScore: Number(s.auto_score),
                manualScore: Number(s.manual_score),
                totalScore: Number(s.total_score),
                maxPossibleScore: Number(s.max_possible_score),
                percentageScore: Number(s.percentage_score),
              }
            : null,
        };
      }

      if (!['IN_PROGRESS', 'READY', 'PAUSED', 'EXPIRED'].includes(part.status)) {
        throw new ConflictException(`Sesi ujian berstatus ${part.status} tidak dapat dikumpulkan`);
      }

      const grading = await this.gradingService.runSubmissionGradingInTx(tx, part.id, part.exam_id);
      const submissionId = crypto.randomUUID();
      const submittedAt = new Date().toISOString();

      await tx.query(
        `INSERT INTO exam_submissions (
          id, exam_participant_id, idempotency_key, submitted_by_user_id, submission_reason,
          answers_snapshot, auto_score, manual_score, total_score, max_possible_score,
          percentage_score, grading_status, submitted_at
        ) VALUES ($1, $2, $3, $4, 'MANUAL_SUBMIT', $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          submissionId,
          part.id,
          idemKey,
          studentUser.sub,
          JSON.stringify(grading.answersSnapshot),
          grading.autoScore,
          grading.manualScore,
          grading.totalScore,
          grading.maxPossibleScore,
          grading.percentageScore,
          grading.gradingStatus,
          submittedAt,
        ],
      );

      await tx.query(
        `UPDATE exam_participants
         SET status = 'SUBMITTED',
             submitted_at = $2,
             unsynced_answers_count = 0,
             final_score = $3,
             updated_at = NOW()
         WHERE id = $1`,
        [part.id, submittedAt, grading.totalScore],
      );

      await tx.query(
        `INSERT INTO anti_cheating_events (
          id, exam_session_id, exam_participant_id, event_type, classification, metadata
        ) VALUES ($1, $2, $3, 'EXAM_SUBMITTED', 'INFORMATION', $4)`,
        [
          crypto.randomUUID(),
          part.exam_session_id,
          part.id,
          JSON.stringify({ submissionId, gradingStatus: grading.gradingStatus }),
        ],
      );

      return {
        idempotentReplay: false,
        submissionId,
        participantId: part.id,
        status: 'SUBMITTED',
        submissionReason: 'MANUAL_SUBMIT',
        gradingStatus: grading.gradingStatus,
        submittedAtUtc: submittedAt,
        score: part.publish_results
          ? {
              autoScore: grading.autoScore,
              manualScore: grading.manualScore,
              totalScore: grading.totalScore,
              maxPossibleScore: grading.maxPossibleScore,
              percentageScore: grading.percentageScore,
            }
          : null,
      };
    });

    if (!submissionResult.idempotentReplay) {
      await this.audit.log({
        schoolId: studentUser.schoolId,
        actorUserId: studentUser.sub,
        actorRole: 'STUDENT',
        action: 'EXAM_SUBMITTED',
        targetType: 'EXAM_PARTICIPANT',
        targetId: part.id,
        metadata: {
          submissionId: submissionResult.submissionId,
          gradingStatus: submissionResult.gradingStatus,
        },
      });
    }

    return submissionResult;
  }
}
