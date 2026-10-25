import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import * as crypto from 'crypto';

const SENSITIVE_FIELD_PATTERNS = [
  /password/i,
  /token/i,
  /secret/i,
  /answer_?key/i,
  /answer_?payload/i,
  /camera_?frame/i,
  /video/i,
];

export function sanitizeMetadataForAudit(meta: Record<string, any> = {}): Record<string, any> {
  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (SENSITIVE_FIELD_PATTERNS.some((rx) => rx.test(key))) {
      cleaned[key] = '[REDACTED]';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      cleaned[key] = sanitizeMetadataForAudit(value);
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

@Injectable()
export class AuditService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async log(params: {
    schoolId?: string | null;
    actorUserId?: string | null;
    actorRole: string;
    action: string;
    targetType: string;
    targetId?: string | null;
    metadata?: Record<string, any>;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<string> {
    const id = crypto.randomUUID();
    const safeMeta = sanitizeMetadataForAudit(params.metadata || {});
    await this.db.query(
      `INSERT INTO audit_logs (
        id, school_id, actor_user_id, actor_role, action, target_type, target_id, metadata, ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        id,
        params.schoolId || null,
        params.actorUserId || null,
        params.actorRole || 'ANONYMOUS',
        params.action,
        params.targetType,
        params.targetId || null,
        JSON.stringify(safeMeta),
        params.ipAddress || null,
        params.userAgent || null,
      ],
    );
    return id;
  }
}
