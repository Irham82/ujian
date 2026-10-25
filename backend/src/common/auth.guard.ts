import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PUBLIC_KEY, ROLES_KEY, RoleCode } from './roles.decorator';
import {
  SessionTokenPayload,
  verifyCsrfToken,
  verifySessionToken,
} from './crypto.util';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../database/redis.service';
import { AuditService } from './audit.service';
import * as crypto from 'crypto';

export interface AuthenticatedRequest {
  user: SessionTokenPayload;
  authTransport: 'bearer' | 'cookie';
  headers: Record<string, string | string[] | undefined>;
  cookies?: Record<string, string>;
  method: string;
  url: string;
  ip?: string;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(RedisService) private readonly redis: RedisService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authHeader = req.headers['authorization'];
    let token: string | undefined;
    let transport: 'bearer' | 'cookie' = 'bearer';

    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
      transport = 'bearer';
    } else if (req.cookies && req.cookies['cbt_access_token']) {
      token = req.cookies['cbt_access_token'];
      transport = 'cookie';
    }

    if (!token) {
      throw new UnauthorizedException('Token autentikasi tidak ditemukan');
    }

    const payload = verifySessionToken(token);
    if (!payload) {
      throw new UnauthorizedException('Token sesi tidak valid atau telah kedaluwarsa');
    }

    // Check if session has been explicitly revoked in Redis
    const isRevoked = await this.redis.get(`revoked_sid:${payload.sid}`);
    if (isRevoked) {
      throw new UnauthorizedException('Sesi ini telah dicabut atau berakhir');
    }

    // Verify user active status & single-session binding in DB (cached briefly in Redis for 500+ performance)
    let activeSid = await this.redis.get(`active_sid:${payload.sub}`);
    if (!activeSid) {
      const userRow = await this.db.query<{
        is_active: boolean;
        active_session_id: string | null;
      }>('SELECT is_active, active_session_id FROM users WHERE id = $1 AND deleted_at IS NULL', [
        payload.sub,
      ]);
      if (userRow.rows.length === 0 || !userRow.rows[0].is_active) {
        throw new UnauthorizedException('Akun pengguna tidak aktif');
      }
      activeSid = userRow.rows[0].active_session_id || '';
      if (activeSid) {
        await this.redis.set(`active_sid:${payload.sub}`, activeSid, 60);
      }
    }

    if (activeSid && activeSid !== payload.sid) {
      // Record duplicate/superseded session event if student has active exam participant
      await this.recordDuplicateOrInvalidSession(payload.sub, 'SESSION_DUPLICATE', {
        expectedSid: activeSid,
        presentedSid: payload.sid,
        url: req.url,
      });
      throw new UnauthorizedException(
        'Sesi Anda telah digantikan oleh login baru pada perangkat/tab lain (SESSION_DUPLICATE)',
      );
    }

    // Enforce CSRF token when using cookie transport on state-modifying methods
    const method = (req.method || 'GET').toUpperCase();
    if (transport === 'cookie' && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      const csrfHeader = req.headers['x-csrf-token'];
      const csrfToken = Array.isArray(csrfHeader) ? csrfHeader[0] : csrfHeader;
      if (!csrfToken || !verifyCsrfToken(payload.sid, csrfToken)) {
        throw new ForbiddenException('Token CSRF tidak valid atau tidak disertakan');
      }
    }

    // Per-user API rate limiting (protects server stability while allowing high-concurrency exam traffic)
    const rateLimitMax = Number(process.env.API_RATE_LIMIT_PER_MINUTE || 240);
    const rateInfo = await this.redis.incrWithWindow(`rl:user:${payload.sub}`, 60);
    if (rateInfo.count > rateLimitMax) {
      await this.recordDuplicateOrInvalidSession(payload.sub, 'RATE_LIMIT_TRIGGERED', {
        count: rateInfo.count,
        limit: rateLimitMax,
        url: req.url,
      });
      throw new HttpException(
        'Terlalu banyak permintaan dalam waktu singkat (RATE_LIMIT_TRIGGERED)',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    req.user = payload;
    req.authTransport = transport;

    const requiredRoles = this.reflector.getAllAndOverride<RoleCode[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (requiredRoles && requiredRoles.length > 0) {
      const hasRole = requiredRoles.some((r) => payload.roles.includes(r));
      if (!hasRole) {
        await this.audit.log({
          schoolId: payload.schoolId,
          actorUserId: payload.sub,
          actorRole: payload.roles.join(','),
          action: 'UNAUTHORIZED_ACCESS',
          targetType: 'ENDPOINT',
          targetId: `${method} ${req.url}`,
          metadata: { requiredRoles, userRoles: payload.roles },
          ipAddress: req.ip || null,
          userAgent: String(req.headers['user-agent'] || ''),
        });
        await this.recordDuplicateOrInvalidSession(payload.sub, 'UNAUTHORIZED_ACCESS', {
          requiredRoles,
          userRoles: payload.roles,
          endpoint: `${method} ${req.url}`,
        });
        throw new ForbiddenException('Anda tidak memiliki hak akses ke sumber daya ini');
      }
    }

    return true;
  }

  private async recordDuplicateOrInvalidSession(
    userId: string,
    eventType: 'SESSION_DUPLICATE' | 'RATE_LIMIT_TRIGGERED' | 'UNAUTHORIZED_ACCESS',
    metadata: Record<string, any>,
  ): Promise<void> {
    try {
      const activeParticipant = await this.db.query<{
        id: string;
        exam_session_id: string;
      }>(
        `SELECT id, exam_session_id FROM exam_participants
         WHERE student_user_id = $1 AND status IN ('IN_PROGRESS', 'READY', 'PAUSED')
         ORDER BY updated_at DESC LIMIT 1`,
        [userId],
      );
      if (activeParticipant.rows.length > 0) {
        const p = activeParticipant.rows[0];
        const classification =
          eventType === 'UNAUTHORIZED_ACCESS'
            ? 'SECURITY_INCIDENT'
            : eventType === 'SESSION_DUPLICATE'
              ? 'REVIEW_REQUIRED'
              : 'ATTENTION';
        await this.db.query(
          `INSERT INTO anti_cheating_events (
            id, exam_session_id, exam_participant_id, event_type, classification, metadata
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            crypto.randomUUID(),
            p.exam_session_id,
            p.id,
            eventType,
            classification,
            JSON.stringify(metadata),
          ],
        );
        await this.db.query(
          `UPDATE exam_participants
           SET security_events_count = security_events_count + 1,
               needs_review = CASE WHEN $2 IN ('REVIEW_REQUIRED', 'SECURITY_INCIDENT') THEN TRUE ELSE needs_review END,
               updated_at = NOW()
           WHERE id = $1`,
          [p.id, classification],
        );
      }
    } catch {
      // Non-blocking telemetry
    }
  }
}
