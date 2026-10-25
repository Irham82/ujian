import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { AuditService } from '../../common/audit.service';
import { hashPassword, SessionTokenPayload } from '../../common/crypto.util';
import * as crypto from 'crypto';

@Injectable()
export class AcademicService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async listUsers(user: SessionTokenPayload, roleFilter?: string) {
    let sql = `
      SELECT u.id, u.school_id, u.username, u.email, u.full_name, u.identifier_code,
             u.is_active, u.last_login_at, u.created_at,
             COALESCE(json_agg(r.code) FILTER (WHERE r.code IS NOT NULL), '[]') AS roles
      FROM users u
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN roles r ON r.id = ur.role_id
      WHERE u.school_id = $1 AND u.deleted_at IS NULL
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `;
    const res = await this.db.query(sql, [user.schoolId]);
    if (roleFilter) {
      return res.rows.filter((r) => Array.isArray(r.roles) && r.roles.includes(roleFilter));
    }
    return res.rows;
  }

  async createUser(
    actor: SessionTokenPayload,
    dto: {
      username: string;
      email: string;
      fullName: string;
      identifierCode?: string;
      password?: string;
      roles: string[];
      classId?: string;
    },
  ) {
    if (!dto.username || !dto.email || !dto.fullName || !dto.roles?.length) {
      throw new BadRequestException('username, email, fullName, dan roles wajib diisi');
    }

    const userId = crypto.randomUUID();
    const passwordHash = await hashPassword(dto.password || 'CbtPro#2026');

    await this.db.withTransaction(async (tx) => {
      await tx.query(
        `INSERT INTO users (id, school_id, username, email, full_name, identifier_code, password_hash, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)`,
        [
          userId,
          actor.schoolId,
          dto.username.trim(),
          dto.email.trim(),
          dto.fullName.trim(),
          dto.identifierCode || null,
          passwordHash,
        ],
      );

      for (const roleCode of dto.roles) {
        const roleRes = await tx.query<{ id: string }>(
          'SELECT id FROM roles WHERE code = $1',
          [roleCode],
        );
        if (roleRes.rows.length === 0) {
          throw new BadRequestException(`Role ${roleCode} tidak valid`);
        }
        await tx.query(
          `INSERT INTO user_roles (id, user_id, role_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [crypto.randomUUID(), userId, roleRes.rows[0].id],
        );
      }

      if (dto.classId) {
        const membershipRole = dto.roles.includes('TEACHER') ? 'TEACHER' : 'STUDENT';
        await tx.query(
          `INSERT INTO class_memberships (id, class_id, user_id, membership_role)
           VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
          [crypto.randomUUID(), dto.classId, userId, membershipRole],
        );
      }
    });

    await this.audit.log({
      schoolId: actor.schoolId,
      actorUserId: actor.sub,
      actorRole: actor.roles.join(','),
      action: 'USER_CREATED',
      targetType: 'USER',
      targetId: userId,
      metadata: { username: dto.username, roles: dto.roles },
    });

    return { id: userId, username: dto.username, email: dto.email, fullName: dto.fullName, roles: dto.roles };
  }

  async updateUserStatus(
    actor: SessionTokenPayload,
    targetUserId: string,
    dto: { isActive?: boolean; roles?: string[]; fullName?: string },
  ) {
    await this.db.withTransaction(async (tx) => {
      if (typeof dto.isActive === 'boolean' || dto.fullName) {
        await tx.query(
          `UPDATE users
           SET is_active = COALESCE($2, is_active),
               full_name = COALESCE($3, full_name),
               updated_at = NOW()
           WHERE id = $1 AND school_id = $4`,
          [targetUserId, dto.isActive ?? null, dto.fullName ?? null, actor.schoolId],
        );
      }
      if (dto.roles && dto.roles.length > 0) {
        await tx.query('DELETE FROM user_roles WHERE user_id = $1', [targetUserId]);
        for (const roleCode of dto.roles) {
          const roleRes = await tx.query<{ id: string }>('SELECT id FROM roles WHERE code = $1', [
            roleCode,
          ]);
          if (roleRes.rows.length > 0) {
            await tx.query(
              'INSERT INTO user_roles (id, user_id, role_id) VALUES ($1, $2, $3)',
              [crypto.randomUUID(), targetUserId, roleRes.rows[0].id],
            );
          }
        }
      }
    });

    await this.audit.log({
      schoolId: actor.schoolId,
      actorUserId: actor.sub,
      actorRole: actor.roles.join(','),
      action: 'USER_UPDATED',
      targetType: 'USER',
      targetId: targetUserId,
      metadata: dto,
    });

    return { id: targetUserId, updated: true };
  }

  async listAcademicYears(user: SessionTokenPayload) {
    const res = await this.db.query(
      `SELECT * FROM academic_years WHERE school_id = $1 ORDER BY start_date DESC`,
      [user.schoolId],
    );
    return res.rows;
  }

  async createAcademicYear(
    actor: SessionTokenPayload,
    dto: { name: string; semester: 'GANJIL' | 'GENAP'; isActive?: boolean; startDate: string; endDate: string },
  ) {
    const id = crypto.randomUUID();
    await this.db.query(
      `INSERT INTO academic_years (id, school_id, name, semester, is_active, start_date, end_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, actor.schoolId, dto.name, dto.semester, Boolean(dto.isActive), dto.startDate, dto.endDate],
    );
    return { id, ...dto };
  }

  async listClasses(user: SessionTokenPayload) {
    if (user.roles.includes('ADMIN')) {
      const res = await this.db.query(
        `SELECT c.*, u.full_name AS homeroom_teacher_name,
                (SELECT COUNT(*)::int FROM class_memberships cm WHERE cm.class_id = c.id AND cm.membership_role = 'STUDENT') AS student_count
         FROM classes c
         LEFT JOIN users u ON u.id = c.homeroom_teacher_id
         WHERE c.school_id = $1 AND c.deleted_at IS NULL
         ORDER BY c.grade_level, c.name`,
        [user.schoolId],
      );
      return res.rows;
    }

    // Teacher or student only sees classes assigned to them
    const res = await this.db.query(
      `SELECT c.*, u.full_name AS homeroom_teacher_name,
              (SELECT COUNT(*)::int FROM class_memberships cm WHERE cm.class_id = c.id AND cm.membership_role = 'STUDENT') AS student_count
       FROM classes c
       LEFT JOIN users u ON u.id = c.homeroom_teacher_id
       WHERE c.school_id = $1 AND c.deleted_at IS NULL
         AND (
           c.homeroom_teacher_id = $2
           OR EXISTS (SELECT 1 FROM class_memberships cm WHERE cm.class_id = c.id AND cm.user_id = $2)
         )
       ORDER BY c.grade_level, c.name`,
      [user.schoolId, user.sub],
    );
    return res.rows;
  }

  async createClass(
    actor: SessionTokenPayload,
    dto: { academicYearId: string; name: string; gradeLevel: string; homeroomTeacherId?: string },
  ) {
    const id = crypto.randomUUID();
    await this.db.query(
      `INSERT INTO classes (id, school_id, academic_year_id, name, grade_level, homeroom_teacher_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, actor.schoolId, dto.academicYearId, dto.name, dto.gradeLevel, dto.homeroomTeacherId || null],
    );
    await this.audit.log({
      schoolId: actor.schoolId,
      actorUserId: actor.sub,
      actorRole: actor.roles.join(','),
      action: 'CLASS_CREATED',
      targetType: 'CLASS',
      targetId: id,
      metadata: dto,
    });
    return { id, ...dto };
  }

  async addClassMember(
    actor: SessionTokenPayload,
    classId: string,
    dto: { userId: string; membershipRole: 'STUDENT' | 'TEACHER' },
  ) {
    const id = crypto.randomUUID();
    await this.db.query(
      `INSERT INTO class_memberships (id, class_id, user_id, membership_role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (class_id, user_id, membership_role) DO NOTHING`,
      [id, classId, dto.userId, dto.membershipRole],
    );
    return { id, classId, ...dto };
  }

  async getClassMembers(actor: SessionTokenPayload, classId: string) {
    if (!actor.roles.includes('ADMIN')) {
      const assigned = await this.db.query(
        `SELECT 1 FROM classes c
         WHERE c.id = $1 AND (
           c.homeroom_teacher_id = $2
           OR EXISTS (SELECT 1 FROM class_memberships cm WHERE cm.class_id = c.id AND cm.user_id = $2)
         )`,
        [classId, actor.sub],
      );
      if (assigned.rows.length === 0) {
        await this.audit.log({
          schoolId: actor.schoolId,
          actorUserId: actor.sub,
          actorRole: actor.roles.join(','),
          action: 'UNAUTHORIZED_CLASS_ACCESS',
          targetType: 'CLASS',
          targetId: classId,
        });
        throw new ForbiddenException('Guru/pengguna tidak ditugaskan pada kelas ini');
      }
    }

    const res = await this.db.query(
      `SELECT cm.id, cm.membership_role, u.id AS user_id, u.username, u.full_name, u.identifier_code, u.email
       FROM class_memberships cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.class_id = $1 AND u.deleted_at IS NULL
       ORDER BY cm.membership_role, u.full_name`,
      [classId],
    );
    return res.rows;
  }

  async listSubjects(user: SessionTokenPayload) {
    const res = await this.db.query(
      `SELECT * FROM subjects WHERE school_id = $1 ORDER BY code`,
      [user.schoolId],
    );
    return res.rows;
  }

  async createSubject(
    actor: SessionTokenPayload,
    dto: { code: string; name: string; description?: string },
  ) {
    const id = crypto.randomUUID();
    await this.db.query(
      `INSERT INTO subjects (id, school_id, code, name, description)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, actor.schoolId, dto.code.trim().toUpperCase(), dto.name.trim(), dto.description || null],
    );
    return { id, ...dto };
  }

  async listRooms(user: SessionTokenPayload) {
    const res = await this.db.query(
      `SELECT * FROM rooms WHERE school_id = $1 ORDER BY code`,
      [user.schoolId],
    );
    return res.rows;
  }

  async createRoom(
    actor: SessionTokenPayload,
    dto: { code: string; name: string; capacity?: number; location?: string },
  ) {
    const id = crypto.randomUUID();
    await this.db.query(
      `INSERT INTO rooms (id, school_id, code, name, capacity, location)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, actor.schoolId, dto.code, dto.name, dto.capacity || 40, dto.location || null],
    );
    return { id, ...dto };
  }

  async getSystemSettings(user: SessionTokenPayload) {
    const res = await this.db.query<{ setting_key: string; setting_value: any; updated_at: string }>(
      `SELECT setting_key, setting_value, updated_at FROM system_settings WHERE school_id = $1`,
      [user.schoolId],
    );
    const map: Record<string, any> = {};
    for (const r of res.rows) {
      map[r.setting_key] = r.setting_value;
    }
    return map;
  }

  async updateSystemSetting(
    actor: SessionTokenPayload,
    settingKey: string,
    settingValue: Record<string, any>,
  ) {
    const id = crypto.randomUUID();
    await this.db.query(
      `INSERT INTO system_settings (id, school_id, setting_key, setting_value, updated_by_user_id, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (school_id, setting_key)
       DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by_user_id = EXCLUDED.updated_by_user_id, updated_at = NOW()`,
      [id, actor.schoolId, settingKey, JSON.stringify(settingValue), actor.sub],
    );
    await this.audit.log({
      schoolId: actor.schoolId,
      actorUserId: actor.sub,
      actorRole: actor.roles.join(','),
      action: 'SYSTEM_SETTING_UPDATED',
      targetType: 'SYSTEM_SETTING',
      targetId: settingKey,
      metadata: settingValue,
    });
    return { settingKey, settingValue };
  }

  async listNotifications(user: SessionTokenPayload) {
    const res = await this.db.query(
      `SELECT * FROM notifications
       WHERE school_id = $1
         AND (recipient_user_id IS NULL OR recipient_user_id = $2 OR recipient_role = ANY($3::varchar[]))
       ORDER BY created_at DESC LIMIT 50`,
      [user.schoolId, user.sub, user.roles],
    );
    return res.rows;
  }

  async createNotification(
    actor: SessionTokenPayload,
    dto: { title: string; body: string; recipientRole?: string; recipientUserId?: string; category?: string },
  ) {
    if (!dto.title || !dto.body) {
      throw new NotFoundException('Judul dan isi pengumuman wajib diisi');
    }
    const id = crypto.randomUUID();
    await this.db.query(
      `INSERT INTO notifications (id, school_id, recipient_user_id, recipient_role, title, body, category, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        actor.schoolId,
        dto.recipientUserId || null,
        dto.recipientRole || null,
        dto.title,
        dto.body,
        dto.category || 'ANNOUNCEMENT',
        actor.sub,
      ],
    );
    return { id, ...dto };
  }
}
