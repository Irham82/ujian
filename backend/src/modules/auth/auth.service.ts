import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { RedisService } from '../../database/redis.service';
import { AuditService } from '../../common/audit.service';
import {
  generateCsrfToken,
  hashPassword,
  SessionTokenPayload,
  signSessionToken,
  verifyPassword,
} from '../../common/crypto.util';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(RedisService) private readonly redis: RedisService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async login(params: {
    usernameOrEmail: string;
    password: string;
    ipAddress?: string;
    userAgent?: string;
  }) {
    const identifier = (params.usernameOrEmail || '').trim();
    if (!identifier || !params.password) {
      throw new BadRequestException('Username/email dan password wajib diisi');
    }

    // Brute-force rate limit per username
    const rl = await this.redis.incrWithWindow(`rl:login:${identifier.toLowerCase()}`, 60);
    if (rl.count > 10) {
      throw new HttpException(
        'Terlalu banyak percobaan login. Silakan tunggu 1 menit.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const userRes = await this.db.query<{
      id: string;
      school_id: string;
      username: string;
      email: string;
      full_name: string;
      identifier_code: string | null;
      password_hash: string;
      is_active: boolean;
      failed_login_attempts: number;
      locked_until: string | null;
      active_session_id: string | null;
      school_name: string;
      school_timezone: string;
    }>(
      `SELECT u.*, s.name AS school_name, s.timezone AS school_timezone
       FROM users u
       JOIN schools s ON s.id = u.school_id
       WHERE (LOWER(u.username) = LOWER($1) OR LOWER(u.email) = LOWER($1))
         AND u.deleted_at IS NULL
       LIMIT 1`,
      [identifier],
    );

    if (userRes.rows.length === 0) {
      throw new UnauthorizedException('Kredensial login tidak valid');
    }

    const user = userRes.rows[0];
    if (!user.is_active) {
      throw new ForbiddenException('Akun Anda telah dinonaktifkan oleh Administrator');
    }

    if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
      throw new HttpException(
        'Akun terkunci sementara karena terlalu banyak percobaan gagal',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const validPassword = await verifyPassword(user.password_hash, params.password);
    if (!validPassword) {
      const nextFailed = (user.failed_login_attempts || 0) + 1;
      const lockUntil =
        nextFailed >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
      await this.db.query(
        `UPDATE users SET failed_login_attempts = $2, locked_until = $3, updated_at = NOW() WHERE id = $1`,
        [user.id, nextFailed, lockUntil],
      );
      await this.audit.log({
        schoolId: user.school_id,
        actorUserId: user.id,
        actorRole: 'UNKNOWN',
        action: 'LOGIN_FAILED',
        targetType: 'USER',
        targetId: user.id,
        metadata: { failedAttempts: nextFailed, locked: Boolean(lockUntil) },
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      });
      throw new UnauthorizedException('Kredensial login tidak valid');
    }

    const rolesRes = await this.db.query<{ code: string }>(
      `SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1`,
      [user.id],
    );
    const roles = rolesRes.rows.map((r) => r.code);

    // Check if user had a previous active session & if student is currently IN_PROGRESS on an exam
    const previousSid = user.active_session_id;
    const newSid = crypto.randomUUID();
    let duplicateExamSessionDetected = false;

    if (previousSid && previousSid !== newSid) {
      await this.redis.set(`revoked_sid:${previousSid}`, 'SUPERSEDED', 8 * 3600);
      if (roles.includes('STUDENT')) {
        const activeExam = await this.db.query<{ id: string; exam_session_id: string }>(
          `SELECT id, exam_session_id FROM exam_participants
           WHERE student_user_id = $1 AND status = 'IN_PROGRESS'
           LIMIT 1`,
          [user.id],
        );
        if (activeExam.rows.length > 0) {
          duplicateExamSessionDetected = true;
          const p = activeExam.rows[0];
          await this.db.query(
            `INSERT INTO anti_cheating_events (
              id, exam_session_id, exam_participant_id, event_type, classification, metadata
            ) VALUES ($1, $2, $3, 'SESSION_DUPLICATE', 'REVIEW_REQUIRED', $4)`,
            [
              crypto.randomUUID(),
              p.exam_session_id,
              p.id,
              JSON.stringify({
                reason: 'New login while exam IN_PROGRESS',
                previousSid,
                newSid,
                userAgent: params.userAgent || '',
              }),
            ],
          );
          await this.db.query(
            `UPDATE exam_participants
             SET security_events_count = security_events_count + 1,
                 needs_review = TRUE,
                 session_binding_token = $2,
                 updated_at = NOW()
             WHERE id = $1`,
            [p.id, newSid],
          );
        }
      }
    }

    await this.db.query(
      `UPDATE users
       SET failed_login_attempts = 0,
           locked_until = NULL,
           active_session_id = $2,
           last_login_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [user.id, newSid],
    );
    await this.redis.set(`active_sid:${user.id}`, newSid, 8 * 3600);

    const accessToken = signSessionToken({
      sub: user.id,
      schoolId: user.school_id,
      username: user.username,
      fullName: user.full_name,
      roles,
      sid: newSid,
    });
    const csrfToken = generateCsrfToken(newSid);

    await this.audit.log({
      schoolId: user.school_id,
      actorUserId: user.id,
      actorRole: roles.join(','),
      action: 'LOGIN_SUCCESS',
      targetType: 'USER',
      targetId: user.id,
      metadata: { duplicateExamSessionDetected },
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    });

    return {
      accessToken,
      csrfToken,
      duplicateExamSessionDetected,
      user: {
        id: user.id,
        schoolId: user.school_id,
        schoolName: user.school_name,
        schoolTimezone: user.school_timezone,
        username: user.username,
        email: user.email,
        fullName: user.full_name,
        identifierCode: user.identifier_code,
        roles,
      },
    };
  }

  async logout(user: SessionTokenPayload, ipAddress?: string, userAgent?: string) {
    await this.redis.set(`revoked_sid:${user.sid}`, 'LOGOUT', 8 * 3600);
    await this.redis.del(`active_sid:${user.sub}`);
    await this.db.query(
      `UPDATE users SET active_session_id = NULL, updated_at = NOW() WHERE id = $1 AND active_session_id = $2`,
      [user.sub, user.sid],
    );
    await this.audit.log({
      schoolId: user.schoolId,
      actorUserId: user.sub,
      actorRole: user.roles.join(','),
      action: 'LOGOUT',
      targetType: 'USER',
      targetId: user.sub,
      ipAddress,
      userAgent,
    });
    return { success: true };
  }

  async rotateSession(user: SessionTokenPayload) {
    const newSid = crypto.randomUUID();
    await this.redis.set(`revoked_sid:${user.sid}`, 'ROTATED', 8 * 3600);
    await this.db.query(`UPDATE users SET active_session_id = $2, updated_at = NOW() WHERE id = $1`, [
      user.sub,
      newSid,
    ]);
    await this.redis.set(`active_sid:${user.sub}`, newSid, 8 * 3600);

    const accessToken = signSessionToken({
      sub: user.sub,
      schoolId: user.schoolId,
      username: user.username,
      fullName: user.fullName,
      roles: user.roles,
      sid: newSid,
    });
    const csrfToken = generateCsrfToken(newSid);
    return { accessToken, csrfToken };
  }

  async getMe(userId: string) {
    const res = await this.db.query<{
      id: string;
      school_id: string;
      username: string;
      email: string;
      full_name: string;
      identifier_code: string | null;
      last_login_at: string | null;
      school_name: string;
      school_timezone: string;
    }>(
      `SELECT u.id, u.school_id, u.username, u.email, u.full_name, u.identifier_code, u.last_login_at,
              s.name AS school_name, s.timezone AS school_timezone
       FROM users u
       JOIN schools s ON s.id = u.school_id
       WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [userId],
    );
    if (res.rows.length === 0) {
      throw new UnauthorizedException('Pengguna tidak ditemukan');
    }
    const rolesRes = await this.db.query<{ code: string }>(
      `SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1`,
      [userId],
    );
    const u = res.rows[0];
    return {
      id: u.id,
      schoolId: u.school_id,
      schoolName: u.school_name,
      schoolTimezone: u.school_timezone,
      username: u.username,
      email: u.email,
      fullName: u.full_name,
      identifierCode: u.identifier_code,
      lastLoginAt: u.last_login_at,
      roles: rolesRes.rows.map((r) => r.code),
      serverTimeUtc: new Date().toISOString(),
    };
  }

  async updateProfile(
    user: SessionTokenPayload,
    dto: { fullName?: string; email?: string; currentPassword?: string; newPassword?: string },
  ) {
    if (dto.newPassword) {
      if (!dto.currentPassword) {
        throw new BadRequestException('Password saat ini wajib diisi untuk mengganti password');
      }
      if (dto.newPassword.length < 8) {
        throw new BadRequestException('Password baru minimal 8 karakter');
      }
      const row = await this.db.query<{ password_hash: string }>(
        'SELECT password_hash FROM users WHERE id = $1',
        [user.sub],
      );
      const valid = await verifyPassword(row.rows[0]?.password_hash || '', dto.currentPassword);
      if (!valid) {
        throw new UnauthorizedException('Password saat ini tidak sesuai');
      }
      const newHash = await hashPassword(dto.newPassword);
      await this.db.query('UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1', [
        user.sub,
        newHash,
      ]);
    }

    if (dto.fullName || dto.email) {
      await this.db.query(
        `UPDATE users
         SET full_name = COALESCE($2, full_name),
             email = COALESCE($3, email),
             updated_at = NOW()
         WHERE id = $1`,
        [user.sub, dto.fullName || null, dto.email || null],
      );
    }

    await this.audit.log({
      schoolId: user.schoolId,
      actorUserId: user.sub,
      actorRole: user.roles.join(','),
      action: 'PROFILE_UPDATED',
      targetType: 'USER',
      targetId: user.sub,
      metadata: { passwordChanged: Boolean(dto.newPassword) },
    });

    return this.getMe(user.sub);
  }
}
