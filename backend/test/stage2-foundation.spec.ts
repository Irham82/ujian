import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createConfiguredApp } from '../src/main';
import { ORDERED_BACKUP_TABLES } from '../src/database/backup.service';
import { DatabaseService } from '../src/database/database.service';

describe('Tahap 2 — Fondasi: Database 31 Tabel, Argon2id Auth, CSRF, Session Control & RBAC', () => {
  let app: INestApplication;
  let db: DatabaseService;

  beforeAll(async () => {
    process.env.DATABASE_URL = 'pglite://memory';
    process.env.REDIS_URL = 'memory://localhost:6379';
    app = await createConfiguredApp();
    await app.init();
    db = app.get(DatabaseService);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('memastikan seluruh 31 tabel utama PostgreSQL telah dibuat oleh migration', async () => {
    const res = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const existingTables = new Set(res.rows.map((r) => r.table_name));
    for (const requiredTable of ORDERED_BACKUP_TABLES) {
      expect(existingTables.has(requiredTable)).toBe(true);
    }
  });

  it('berhasil login untuk kelima role (ADMIN, TEACHER, PROCTOR, SUPERVISOR, STUDENT)', async () => {
    const accounts = [
      { username: 'admin', expectedRole: 'ADMIN' },
      { username: 'guru.matematika', expectedRole: 'TEACHER' },
      { username: 'proktor.utama', expectedRole: 'PROCTOR' },
      { username: 'pengawas.ruang1', expectedRole: 'SUPERVISOR' },
      { username: 'siswa.andi', expectedRole: 'STUDENT' },
    ];

    for (const acc of accounts) {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ username: acc.username, password: 'CbtPro#2026' })
        .expect(201);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.csrfToken).toBeDefined();
      expect(res.body.user.roles).toContain(acc.expectedRole);
      const setCookie = res.headers['set-cookie'];
      expect(setCookie).toBeDefined();
      expect(String(setCookie)).toContain('HttpOnly');
    }
  });

  it('menolak sesi lama ketika pengguna login di perangkat baru (Single Active Session)', async () => {
    const login1 = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'siswa.andi', password: 'CbtPro#2026' })
      .expect(201);

    const login2 = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'siswa.andi', password: 'CbtPro#2026' })
      .expect(201);

    // Token pertama harus ditolak karena telah digantikan
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login1.body.accessToken}`)
      .expect(401);

    // Token kedua tetap valid
    const me2 = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login2.body.accessToken}`)
      .expect(200);
    expect(me2.body.username).toBe('siswa.andi');
  });

  it('menegakkan RBAC dan mencatat UNAUTHORIZED_ACCESS ketika Siswa mengakses endpoint metrik Admin/Proktor', async () => {
    const studentLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'siswa.nadia', password: 'CbtPro#2026' })
      .expect(201);

    await request(app.getHttpServer())
      .get('/api/v1/health/metrics')
      .set('Authorization', `Bearer ${studentLogin.body.accessToken}`)
      .expect(403);

    const auditRes = await db.query<{ action: string }>(
      `SELECT action FROM audit_logs WHERE actor_user_id = $1 AND action = 'UNAUTHORIZED_ACCESS'`,
      [studentLogin.body.user.id],
    );
    expect(auditRes.rows.length).toBeGreaterThan(0);
  });

  it('menegakkan validasi CSRF ketika menggunakan cookie HttpOnly pada request mutasi', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'guru.matematika', password: 'CbtPro#2026' })
      .expect(201);

    const cookies = loginRes.headers['set-cookie'];

    // Tanpa header X-CSRF-Token harus ditolak (403)
    await request(app.getHttpServer())
      .patch('/api/v1/auth/profile')
      .set('Cookie', cookies)
      .send({ fullName: 'Nama Tanpa CSRF' })
      .expect(403);

    // Dengan header X-CSRF-Token yang valid harus diterima (200)
    await request(app.getHttpServer())
      .patch('/api/v1/auth/profile')
      .set('Cookie', cookies)
      .set('X-CSRF-Token', loginRes.body.csrfToken)
      .send({ fullName: 'Ratna Sari, S.Pd., M.Pd.' })
      .expect(200);
  });
});
