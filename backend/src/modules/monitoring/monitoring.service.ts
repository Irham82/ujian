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
import {
  createEncryptedDatabaseBackup,
  restoreEncryptedDatabaseBackup,
} from '../../database/backup.service';
import * as crypto from 'crypto';

export const ALLOWED_SECURITY_EVENTS = new Set([
  'TAB_HIDDEN',
  'WINDOW_BLUR',
  'SESSION_DUPLICATE',
  'INVALID_SESSION',
  'RATE_LIMIT_TRIGGERED',
  'UNAUTHORIZED_ACCESS',
  'CONNECTION_INTERRUPTED',
  'CONNECTION_RESTORED',
  'OFFLINE_BUFFER_CREATED',
  'OFFLINE_SYNC_COMPLETED',
  'OFFLINE_SYNC_CONFLICT',
  'CAMERA_UNAVAILABLE',
  'EXAM_RESUMED',
  'EXAM_SUBMITTED',
  'PROCTOR_WARNING',
  'PROCTOR_INTERVENTION',
]);

export function classifySecurityEvent(
  eventType: string,
  durationMs?: number,
  priorTabBlurCount = 0,
): 'INFORMATION' | 'ATTENTION' | 'REVIEW_REQUIRED' | 'SECURITY_INCIDENT' {
  if (eventType === 'UNAUTHORIZED_ACCESS') {
    return 'SECURITY_INCIDENT';
  }
  if (
    ['SESSION_DUPLICATE', 'INVALID_SESSION', 'OFFLINE_SYNC_CONFLICT', 'PROCTOR_INTERVENTION'].includes(
      eventType,
    )
  ) {
    return 'REVIEW_REQUIRED';
  }
  if (['TAB_HIDDEN', 'WINDOW_BLUR'].includes(eventType)) {
    if ((durationMs && durationMs > 15000) || priorTabBlurCount >= 3) {
      return 'REVIEW_REQUIRED';
    }
    return 'ATTENTION';
  }
  if (['RATE_LIMIT_TRIGGERED', 'CAMERA_UNAVAILABLE', 'PROCTOR_WARNING'].includes(eventType)) {
    return 'ATTENTION';
  }
  return 'INFORMATION';
}

@Injectable()
export class MonitoringService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /**
   * Verifies that the actor (Admin, Proctor, or Supervisor) is assigned to this exam session.
   */
  async verifySessionAssignment(
    actor: SessionTokenPayload,
    sessionId: string,
    requireProctorOrAdmin = false,
  ) {
    const sessRes = await this.db.query<{
      id: string;
      exam_id: string;
      room_id: string;
      title: string;
      status: string;
      school_id: string;
    }>(
      `SELECT es.id, es.exam_id, es.room_id, es.title, es.status, e.school_id
       FROM exam_sessions es
       JOIN exams e ON e.id = es.exam_id
       WHERE es.id = $1 AND e.school_id = $2`,
      [sessionId, actor.schoolId],
    );

    if (sessRes.rows.length === 0) {
      throw new NotFoundException('Sesi ujian tidak ditemukan');
    }

    if (actor.roles.includes('ADMIN')) {
      return sessRes.rows[0];
    }

    if (requireProctorOrAdmin && !actor.roles.includes('PROCTOR')) {
      await this.audit.log({
        schoolId: actor.schoolId,
        actorUserId: actor.sub,
        actorRole: actor.roles.join(','),
        action: 'UNAUTHORIZED_PROCTOR_ACTION',
        targetType: 'EXAM_SESSION',
        targetId: sessionId,
      });
      throw new ForbiddenException('Tindakan ini hanya diizinkan untuk Proktor atau Admin');
    }

    if (actor.roles.includes('PROCTOR')) {
      const assigned = await this.db.query(
        'SELECT 1 FROM exam_proctors WHERE exam_session_id = $1 AND proctor_user_id = $2',
        [sessionId, actor.sub],
      );
      if (assigned.rows.length > 0) {
        return sessRes.rows[0];
      }
    }

    if (!requireProctorOrAdmin && actor.roles.includes('SUPERVISOR')) {
      const assigned = await this.db.query(
        'SELECT 1 FROM exam_supervisors WHERE exam_session_id = $1 AND supervisor_user_id = $2',
        [sessionId, actor.sub],
      );
      if (assigned.rows.length > 0) {
        return sessRes.rows[0];
      }
    }

    await this.audit.log({
      schoolId: actor.schoolId,
      actorUserId: actor.sub,
      actorRole: actor.roles.join(','),
      action: 'UNAUTHORIZED_SESSION_MONITORING_ACCESS',
      targetType: 'EXAM_SESSION',
      targetId: sessionId,
    });
    throw new ForbiddenException('Anda tidak ditugaskan sebagai Proktor/Pengawas pada sesi ujian ini');
  }

  /**
   * Student or system records an anti-cheating / lifecycle event.
   * Participant identity is strictly derived from the authenticated session (`actor.sub`).
   */
  async recordStudentSecurityEvent(
    actor: SessionTokenPayload,
    dto: {
      participantId: string;
      eventType: string;
      durationMs?: number;
      occurredAt?: string;
      metadata?: Record<string, any>;
    },
  ) {
    if (!dto.participantId || !dto.eventType || !ALLOWED_SECURITY_EVENTS.has(dto.eventType)) {
      throw new BadRequestException('participantId dan eventType yang valid wajib diisi');
    }

    const partRes = await this.db.query<{
      id: string;
      exam_session_id: string;
      student_user_id: string;
      security_events_count: number;
    }>(
      `SELECT id, exam_session_id, student_user_id, security_events_count
       FROM exam_participants
       WHERE id = $1`,
      [dto.participantId],
    );

    if (partRes.rows.length === 0) {
      throw new NotFoundException('Sesi peserta ujian tidak ditemukan');
    }

    const part = partRes.rows[0];
    // Identity verified from authenticated token, never trusting arbitrary payload studentId
    if (part.student_user_id !== actor.sub && !actor.roles.includes('ADMIN') && !actor.roles.includes('PROCTOR')) {
      throw new ForbiddenException('Identitas sesi tidak sesuai dengan peserta ujian');
    }

    const classification = classifySecurityEvent(
      dto.eventType,
      dto.durationMs,
      part.security_events_count,
    );

    const eventId = crypto.randomUUID();
    await this.db.query(
      `INSERT INTO anti_cheating_events (
        id, exam_session_id, exam_participant_id, event_type, classification, duration_ms, metadata, occurred_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        eventId,
        part.exam_session_id,
        part.id,
        dto.eventType,
        classification,
        dto.durationMs ?? null,
        JSON.stringify(dto.metadata || {}),
        dto.occurredAt || new Date().toISOString(),
      ],
    );

    const isSecurityCounted = ['ATTENTION', 'REVIEW_REQUIRED', 'SECURITY_INCIDENT'].includes(
      classification,
    );
    const needsReview = ['REVIEW_REQUIRED', 'SECURITY_INCIDENT'].includes(classification);

    let nextConnStatus: string | null = null;
    if (dto.eventType === 'CONNECTION_INTERRUPTED') {
      nextConnStatus = 'OFFLINE_WITHIN_GRACE';
    } else if (dto.eventType === 'CONNECTION_RESTORED') {
      nextConnStatus = 'ONLINE';
    }

    await this.db.query(
      `UPDATE exam_participants
       SET security_events_count = security_events_count + CASE WHEN $2::boolean THEN 1 ELSE 0 END,
           needs_review = CASE WHEN $3::boolean THEN TRUE ELSE needs_review END,
           connection_status = COALESCE($4::varchar, connection_status),
           offline_since_at = CASE WHEN $4::varchar = 'OFFLINE_WITHIN_GRACE' THEN NOW() WHEN $4::varchar = 'ONLINE' THEN NULL ELSE offline_since_at END,
           updated_at = NOW()
       WHERE id = $1`,
      [part.id, isSecurityCounted, needsReview, nextConnStatus],
    );

    return {
      eventId,
      eventType: dto.eventType,
      classification,
      recordedAtUtc: new Date().toISOString(),
    };
  }

  /**
   * Dashboard summary for Proctor & Supervisor (Section 14 requirements).
   */
  async getSessionSummary(actor: SessionTokenPayload, sessionId: string) {
    const sess = await this.verifySessionAssignment(actor, sessionId, false);

    const statsRes = await this.db.query<{
      total_participants: string;
      not_started: string;
      in_progress: string;
      completed: string;
      disconnected: string;
      offline_within_grace: string;
      offline_exceeded_grace: string;
      unsynced_answers_total: string;
      security_events_total: string;
      sessions_needing_review: string;
    }>(
      `SELECT
         COUNT(*)::text AS total_participants,
         COUNT(*) FILTER (WHERE status IN ('READY', 'SCHEDULED', 'DRAFT'))::text AS not_started,
         COUNT(*) FILTER (WHERE status = 'IN_PROGRESS')::text AS in_progress,
         COUNT(*) FILTER (WHERE status IN ('SUBMITTED', 'EXPIRED'))::text AS completed,
         COUNT(*) FILTER (WHERE connection_status IN ('DISCONNECTED', 'OFFLINE_WITHIN_GRACE', 'OFFLINE_EXCEEDED_GRACE'))::text AS disconnected,
         COUNT(*) FILTER (WHERE connection_status = 'OFFLINE_WITHIN_GRACE')::text AS offline_within_grace,
         COUNT(*) FILTER (WHERE connection_status = 'OFFLINE_EXCEEDED_GRACE')::text AS offline_exceeded_grace,
         COALESCE(SUM(unsynced_answers_count), 0)::text AS unsynced_answers_total,
         COALESCE(SUM(security_events_count), 0)::text AS security_events_total,
         COUNT(*) FILTER (WHERE needs_review = TRUE)::text AS sessions_needing_review
       FROM exam_participants
       WHERE exam_session_id = $1`,
      [sessionId],
    );

    const row = statsRes.rows[0];
    return {
      sessionId: sess.id,
      sessionTitle: sess.title,
      sessionStatus: sess.status,
      serverNowUtc: new Date().toISOString(),
      metrics: {
        totalParticipants: Number(row.total_participants),
        notStarted: Number(row.not_started),
        inProgress: Number(row.in_progress),
        completed: Number(row.completed),
        disconnected: Number(row.disconnected),
        offlineWithinGrace: Number(row.offline_within_grace),
        offlineExceededGrace: Number(row.offline_exceeded_grace),
        unsyncedAnswersTotal: Number(row.unsynced_answers_total),
        securityEventsTotal: Number(row.security_events_total),
        sessionsNeedingReview: Number(row.sessions_needing_review),
      },
    };
  }

  async listSessionParticipants(
    actor: SessionTokenPayload,
    sessionId: string,
    query: { status?: string; classId?: string; page?: number; pageSize?: number },
  ) {
    await this.verifySessionAssignment(actor, sessionId, false);
    const page = Math.max(1, Number(query.page || 1));
    const pageSize = Math.min(200, Math.max(1, Number(query.pageSize || 50)));
    const offset = (page - 1) * pageSize;

    const params: any[] = [sessionId];
    let filterSql = '';
    if (query.status) {
      params.push(query.status);
      filterSql += ` AND ep.status = $${params.length}`;
    }
    if (query.classId) {
      params.push(query.classId);
      filterSql += ` AND ep.class_id = $${params.length}`;
    }

    params.push(pageSize, offset);
    const rowsRes = await this.db.query(
      `SELECT ep.id AS participant_id, ep.student_user_id, u.full_name AS student_name,
              u.username, u.identifier_code, COALESCE(c.name, '-') AS class_name,
              ep.status, ep.connection_status, ep.started_at, ep.server_deadline_at,
              ep.extra_time_seconds, ep.submitted_at, ep.unsynced_answers_count,
              ep.security_events_count, ep.needs_review, ep.seb_verified,
              ep.seb_override_by_proctor_id, ep.camera_consent_given, ep.camera_alternative_approved,
              ep.last_heartbeat_at,
              ar.status AS attendance_status, ar.notes AS attendance_notes,
              (SELECT COUNT(*)::int FROM participant_answers pa WHERE pa.exam_participant_id = ep.id) AS answered_count
       FROM exam_participants ep
       JOIN users u ON u.id = ep.student_user_id
       LEFT JOIN classes c ON c.id = ep.class_id
       LEFT JOIN attendance_records ar ON ar.exam_participant_id = ep.id
       WHERE ep.exam_session_id = $1 ${filterSql}
       ORDER BY u.full_name ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    return {
      page,
      pageSize,
      items: rowsRes.rows,
    };
  }

  /**
   * Incremental / paginated security events feed (does not fetch entire history every second).
   */
  async listSessionSecurityEvents(
    actor: SessionTokenPayload,
    sessionId: string,
    query: { sinceUtc?: string; classification?: string; limit?: number },
  ) {
    await this.verifySessionAssignment(actor, sessionId, false);
    const limit = Math.min(100, Math.max(1, Number(query.limit || 50)));
    const params: any[] = [sessionId];
    let filterSql = '';

    if (query.sinceUtc) {
      params.push(query.sinceUtc);
      filterSql += ` AND ace.recorded_at > $${params.length}`;
    }
    if (query.classification) {
      params.push(query.classification);
      filterSql += ` AND ace.classification = $${params.length}`;
    }

    params.push(limit);
    const res = await this.db.query(
      `SELECT ace.*, u.full_name AS student_name, u.identifier_code
       FROM anti_cheating_events ace
       JOIN exam_participants ep ON ep.id = ace.exam_participant_id
       JOIN users u ON u.id = ep.student_user_id
       WHERE ace.exam_session_id = $1 ${filterSql}
       ORDER BY ace.recorded_at DESC
       LIMIT $${params.length}`,
      params,
    );

    return {
      serverNowUtc: new Date().toISOString(),
      items: res.rows,
    };
  }

  async recordAttendance(
    actor: SessionTokenPayload,
    participantId: string,
    dto: { status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED'; notes?: string },
  ) {
    const partRes = await this.db.query<{ id: string; exam_session_id: string }>(
      'SELECT id, exam_session_id FROM exam_participants WHERE id = $1',
      [participantId],
    );
    if (partRes.rows.length === 0) {
      throw new NotFoundException('Peserta tidak ditemukan');
    }
    const part = partRes.rows[0];
    await this.verifySessionAssignment(actor, part.exam_session_id, false);

    const id = crypto.randomUUID();
    await this.db.query(
      `INSERT INTO attendance_records (id, exam_session_id, exam_participant_id, status, notes, recorded_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (exam_participant_id)
       DO UPDATE SET status = EXCLUDED.status, notes = EXCLUDED.notes, recorded_by_user_id = EXCLUDED.recorded_by_user_id, updated_at = NOW()`,
      [id, part.exam_session_id, part.id, dto.status, dto.notes || null, actor.sub],
    );

    await this.audit.log({
      schoolId: actor.schoolId,
      actorUserId: actor.sub,
      actorRole: actor.roles.join(','),
      action: 'ATTENDANCE_RECORDED',
      targetType: 'EXAM_PARTICIPANT',
      targetId: part.id,
      metadata: dto,
    });

    return { participantId: part.id, status: dto.status, notes: dto.notes || null };
  }

  async sendProctorWarning(
    actor: SessionTokenPayload,
    participantId: string,
    dto: { message: string },
  ) {
    const partRes = await this.db.query<{
      id: string;
      exam_session_id: string;
      student_user_id: string;
    }>('SELECT id, exam_session_id, student_user_id FROM exam_participants WHERE id = $1', [
      participantId,
    ]);
    if (partRes.rows.length === 0) {
      throw new NotFoundException('Peserta tidak ditemukan');
    }
    const part = partRes.rows[0];
    // Strictly requires Proctor or Admin (Supervisor cannot issue proctor warnings/interventions)
    await this.verifySessionAssignment(actor, part.exam_session_id, true);

    const eventId = crypto.randomUUID();
    await this.db.query(
      `INSERT INTO anti_cheating_events (
        id, exam_session_id, exam_participant_id, event_type, classification, metadata
      ) VALUES ($1, $2, $3, 'PROCTOR_WARNING', 'ATTENTION', $4)`,
      [
        eventId,
        part.exam_session_id,
        part.id,
        JSON.stringify({ proctorId: actor.sub, message: dto.message }),
      ],
    );

    await this.db.query(
      `INSERT INTO notifications (id, school_id, recipient_user_id, recipient_role, title, body, category, created_by)
       VALUES ($1, $2, $3, 'STUDENT', 'Peringatan Proktor Ujian', $4, 'PROCTOR_WARNING', $5)`,
      [crypto.randomUUID(), actor.schoolId, part.student_user_id, dto.message, actor.sub],
    );

    await this.audit.log({
      schoolId: actor.schoolId,
      actorUserId: actor.sub,
      actorRole: actor.roles.join(','),
      action: 'PROCTOR_WARNING_SENT',
      targetType: 'EXAM_PARTICIPANT',
      targetId: part.id,
      metadata: { message: dto.message },
    });

    return { eventId, participantId: part.id, message: dto.message };
  }

  /**
   * Proctor or Admin performs authorized session recovery / intervention:
   * - RESUME_SESSION (recover from PAUSED or device crash / reset session binding)
   * - PAUSE_SESSION
   * - ADD_EXTRA_TIME (authorized emergency extension)
   * - APPROVE_SEB_EXCEPTION (official recorded SEB exception for incompatible BYOD device)
   * - APPROVE_CAMERA_ALTERNATIVE (official physical supervision alternative when camera unavailable)
   */
  async performProctorIntervention(
    actor: SessionTokenPayload,
    participantId: string,
    dto: {
      actionType:
        | 'RESUME_SESSION'
        | 'PAUSE_SESSION'
        | 'ADD_EXTRA_TIME'
        | 'APPROVE_SEB_EXCEPTION'
        | 'APPROVE_CAMERA_ALTERNATIVE'
        | 'CLEAR_REVIEW_FLAG';
      reason: string;
      extraTimeSeconds?: number;
    },
  ) {
    if (!dto.actionType || !dto.reason) {
      throw new BadRequestException('actionType dan reason (alasan tindakan) wajib diisi');
    }

    const partRes = await this.db.query<{
      id: string;
      exam_session_id: string;
      status: string;
      extra_time_seconds: number;
    }>('SELECT id, exam_session_id, status, extra_time_seconds FROM exam_participants WHERE id = $1', [
      participantId,
    ]);
    if (partRes.rows.length === 0) {
      throw new NotFoundException('Peserta tidak ditemukan');
    }
    const part = partRes.rows[0];
    await this.verifySessionAssignment(actor, part.exam_session_id, true);

    await this.db.withTransaction(async (tx) => {
      if (dto.actionType === 'RESUME_SESSION') {
        const nextStatus = part.status === 'PAUSED' ? 'IN_PROGRESS' : part.status;
        await tx.query(
          `UPDATE exam_participants
           SET status = $2,
               session_binding_token = NULL,
               connection_status = 'ONLINE',
               offline_since_at = NULL,
               needs_review = FALSE,
               updated_at = NOW()
           WHERE id = $1`,
          [part.id, nextStatus],
        );
      } else if (dto.actionType === 'PAUSE_SESSION') {
        await tx.query(
          `UPDATE exam_participants SET status = 'PAUSED', paused_at = NOW(), updated_at = NOW() WHERE id = $1`,
          [part.id],
        );
      } else if (dto.actionType === 'ADD_EXTRA_TIME') {
        const addSec = Math.max(0, Number(dto.extraTimeSeconds || 0));
        await tx.query(
          `UPDATE exam_participants
           SET extra_time_seconds = extra_time_seconds + $2,
               status = CASE WHEN status = 'EXPIRED' THEN 'IN_PROGRESS' ELSE status END,
               updated_at = NOW()
           WHERE id = $1`,
          [part.id, addSec],
        );
      } else if (dto.actionType === 'APPROVE_SEB_EXCEPTION') {
        await tx.query(
          `UPDATE exam_participants
           SET seb_override_by_proctor_id = $2,
               seb_override_reason = $3,
               updated_at = NOW()
           WHERE id = $1`,
          [part.id, actor.sub, dto.reason],
        );
      } else if (dto.actionType === 'APPROVE_CAMERA_ALTERNATIVE') {
        await tx.query(
          `UPDATE exam_participants
           SET camera_alternative_approved = TRUE,
               camera_alternative_notes = $2,
               updated_at = NOW()
           WHERE id = $1`,
          [part.id, dto.reason],
        );
      } else if (dto.actionType === 'CLEAR_REVIEW_FLAG') {
        await tx.query(
          `UPDATE exam_participants SET needs_review = FALSE, updated_at = NOW() WHERE id = $1`,
          [part.id],
        );
      }

      await tx.query(
        `INSERT INTO anti_cheating_events (
          id, exam_session_id, exam_participant_id, event_type, classification, reviewed_by_user_id, review_notes, metadata
        ) VALUES ($1, $2, $3, 'PROCTOR_INTERVENTION', 'REVIEW_REQUIRED', $4, $5, $6)`,
        [
          crypto.randomUUID(),
          part.exam_session_id,
          part.id,
          actor.sub,
          dto.reason,
          JSON.stringify({
            actionType: dto.actionType,
            extraTimeSeconds: dto.extraTimeSeconds || 0,
          }),
        ],
      );
    });

    await this.audit.log({
      schoolId: actor.schoolId,
      actorUserId: actor.sub,
      actorRole: actor.roles.join(','),
      action: `PROCTOR_INTERVENTION_${dto.actionType}`,
      targetType: 'EXAM_PARTICIPANT',
      targetId: part.id,
      metadata: {
        actionType: dto.actionType,
        reason: dto.reason,
        extraTimeSeconds: dto.extraTimeSeconds || 0,
      },
    });

    return {
      participantId: part.id,
      actionType: dto.actionType,
      reason: dto.reason,
      appliedAtUtc: new Date().toISOString(),
    };
  }

  async createIncidentReport(
    actor: SessionTokenPayload,
    sessionId: string,
    dto: {
      participantId?: string;
      category: string;
      severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
      title: string;
      description: string;
      escalateToAdmin?: boolean;
    },
  ) {
    await this.verifySessionAssignment(actor, sessionId, false);
    if (!dto.title || !dto.description || !dto.category) {
      throw new BadRequestException('category, title, dan description wajib diisi');
    }

    // Only Proctor or Admin can directly escalate to Admin; Supervisor submits report to Proctor
    const escalated =
      Boolean(dto.escalateToAdmin) &&
      (actor.roles.includes('PROCTOR') || actor.roles.includes('ADMIN'));

    const id = crypto.randomUUID();
    await this.db.query(
      `INSERT INTO incident_reports (
        id, exam_session_id, exam_participant_id, reported_by_user_id, reporter_role,
        category, severity, title, description, escalated_to_admin, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        id,
        sessionId,
        dto.participantId || null,
        actor.sub,
        actor.roles.join(','),
        dto.category,
        dto.severity || 'MEDIUM',
        dto.title,
        dto.description,
        escalated,
        escalated ? 'ESCALATED' : 'OPEN',
      ],
    );

    await this.audit.log({
      schoolId: actor.schoolId,
      actorUserId: actor.sub,
      actorRole: actor.roles.join(','),
      action: escalated ? 'INCIDENT_ESCALATED_TO_ADMIN' : 'INCIDENT_REPORTED',
      targetType: 'INCIDENT_REPORT',
      targetId: id,
      metadata: { sessionId, category: dto.category, severity: dto.severity || 'MEDIUM' },
    });

    return { id, sessionId, status: escalated ? 'ESCALATED' : 'OPEN', ...dto };
  }

  async listIncidentReports(actor: SessionTokenPayload, sessionId: string) {
    await this.verifySessionAssignment(actor, sessionId, false);
    const res = await this.db.query(
      `SELECT ir.*, u.full_name AS reporter_name
       FROM incident_reports ir
       JOIN users u ON u.id = ir.reported_by_user_id
       WHERE ir.exam_session_id = $1
       ORDER BY ir.created_at DESC`,
      [sessionId],
    );
    return res.rows;
  }

  /**
   * Any access to optional camera metadata/snapshots by Admin or Proctor is strictly audited.
   */
  async inspectParticipantCameraRecord(actor: SessionTokenPayload, participantId: string) {
    const partRes = await this.db.query<{
      id: string;
      exam_session_id: string;
      camera_consent_given: boolean;
      camera_alternative_approved: boolean;
      camera_alternative_notes: string | null;
      camera_enabled: boolean;
      camera_retention_days: number;
    }>(
      `SELECT ep.id, ep.exam_session_id, ep.camera_consent_given,
              ep.camera_alternative_approved, ep.camera_alternative_notes,
              e.camera_enabled, e.camera_retention_days
       FROM exam_participants ep
       JOIN exams e ON e.id = ep.exam_id
       WHERE ep.id = $1`,
      [participantId],
    );
    if (partRes.rows.length === 0) {
      throw new NotFoundException('Peserta tidak ditemukan');
    }
    const part = partRes.rows[0];
    await this.verifySessionAssignment(actor, part.exam_session_id, true);

    await this.audit.log({
      schoolId: actor.schoolId,
      actorUserId: actor.sub,
      actorRole: actor.roles.join(','),
      action: 'CAMERA_DATA_ACCESSED',
      targetType: 'EXAM_PARTICIPANT',
      targetId: part.id,
      metadata: {
        cameraEnabled: part.camera_enabled,
        consentGiven: part.camera_consent_given,
      },
    });

    return {
      participantId: part.id,
      cameraEnabled: part.camera_enabled,
      cameraSupervisionActive: part.camera_enabled && part.camera_consent_given,
      cameraConsentGiven: part.camera_consent_given,
      cameraAlternativeApproved: part.camera_alternative_approved,
      cameraAlternativeNotes: part.camera_alternative_notes,
      retentionDays: part.camera_retention_days,
      auditLogged: true,
    };
  }

  async listAuditLogs(actor: SessionTokenPayload, limit = 100) {
    const safeLimit = Math.min(500, Math.max(1, Number(limit || 100)));
    const res = await this.db.query(
      `SELECT al.*, u.full_name AS actor_name, u.username AS actor_username
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.actor_user_id
       WHERE al.school_id = $1 OR al.school_id IS NULL
       ORDER BY al.created_at DESC
       LIMIT $2`,
      [actor.schoolId, safeLimit],
    );
    return res.rows;
  }

  async triggerBackup(actor: SessionTokenPayload) {
    const backup = await createEncryptedDatabaseBackup(this.db);
    await this.audit.log({
      schoolId: actor.schoolId,
      actorUserId: actor.sub,
      actorRole: actor.roles.join(','),
      action: 'DATABASE_BACKUP_CREATED',
      targetType: 'DATABASE',
      targetId: backup.createdAt,
      metadata: { tableCounts: backup.tableCounts },
    });
    return backup;
  }

  async triggerRestore(actor: SessionTokenPayload, encryptedPayload: string) {
    const restored = await restoreEncryptedDatabaseBackup(this.db, encryptedPayload);
    await this.audit.log({
      schoolId: actor.schoolId,
      actorUserId: actor.sub,
      actorRole: actor.roles.join(','),
      action: 'DATABASE_BACKUP_RESTORED',
      targetType: 'DATABASE',
      targetId: new Date().toISOString(),
      metadata: restored,
    });
    return restored;
  }
}
