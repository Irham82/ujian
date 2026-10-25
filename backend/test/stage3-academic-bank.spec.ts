import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createConfiguredApp } from '../src/main';
import { SEED_IDS } from '../src/database/seed';

describe('Tahap 3 — Akademik, Bank Soal (5 Tipe Soal + Versioning) & Paket Ujian', () => {
  let app: INestApplication;
  let adminToken = '';
  let teacherMtkToken = '';
  let teacherFisikaToken = '';
  let studentToken = '';
  let supervisorToken = '';

  beforeAll(async () => {
    process.env.DATABASE_URL = 'pglite://memory';
    process.env.REDIS_URL = 'memory://localhost:6379';
    app = await createConfiguredApp();
    await app.init();

    const loginAs = async (username: string) => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ username, password: 'CbtPro#2026' })
        .expect(201);
      return res.body.accessToken as string;
    };

    adminToken = await loginAs('admin');
    teacherMtkToken = await loginAs('guru.matematika');
    teacherFisikaToken = await loginAs('guru.fisika');
    studentToken = await loginAs('siswa.andi');
    supervisorToken = await loginAs('pengawas.ruang1');
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('mengizinkan Guru membuat soal baru dan menaikkan versi (versioning + audit) saat kunci jawaban diubah', async () => {
    const createRes = await request(app.getHttpServer())
      .post(`/api/v1/question-banks/${SEED_IDS.BANK_TKA_MATEMATIKA_ID}/questions`)
      .set('Authorization', `Bearer ${teacherMtkToken}`)
      .send({
        questionType: 'SINGLE_CHOICE',
        difficulty: 'MEDIUM',
        category: 'GEOMETRI',
        stemHtml: '<p>Luas persegi dengan sisi 9 cm adalah ...</p>',
        defaultWeight: 10,
        answerKey: { selectedOption: 'B' },
        explanationHtml: 'L = 9 x 9 = 81 cm^2',
        options: [
          { optionKey: 'A', contentHtml: '72 cm²', isCorrect: false },
          { optionKey: 'B', contentHtml: '81 cm²', isCorrect: true },
          { optionKey: 'C', contentHtml: '90 cm²', isCorrect: false },
        ],
      })
      .expect(201);

    expect(createRes.body.version).toBe(1);
    const questionId = createRes.body.id;

    // Update kunci jawaban -> versi naik menjadi 2
    const updateRes = await request(app.getHttpServer())
      .patch(`/api/v1/question-banks/${SEED_IDS.BANK_TKA_MATEMATIKA_ID}/questions/${questionId}`)
      .set('Authorization', `Bearer ${teacherMtkToken}`)
      .send({
        answerKey: { selectedOption: 'C' },
      })
      .expect(200);

    expect(updateRes.body.version).toBe(2);
  });

  it('menolak Guru mengakses bank soal milik guru lain yang tidak dibagikan dan menolak akses kelas yang tidak ditugaskan', async () => {
    // Guru Fisika mencoba membaca Bank Soal Matematika (is_shared = false) -> 403
    await request(app.getHttpServer())
      .get(`/api/v1/question-banks/${SEED_IDS.BANK_TKA_MATEMATIKA_ID}/questions`)
      .set('Authorization', `Bearer ${teacherFisikaToken}`)
      .expect(403);

    // Guru Fisika mencoba membaca daftar anggota Kelas XII MIPA 1 (milik Guru Matematika) -> 403
    await request(app.getHttpServer())
      .get(`/api/v1/academic/classes/${SEED_IDS.CLASS_XII_IPA_1_ID}/members`)
      .set('Authorization', `Bearer ${teacherFisikaToken}`)
      .expect(403);
  });

  it('menolak Siswa dan Pengawas mengakses endpoint Bank Soal & Kunci Jawaban', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/question-banks/${SEED_IDS.BANK_TKA_MATEMATIKA_ID}/questions`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get(`/api/v1/question-banks/${SEED_IDS.BANK_TKA_MATEMATIKA_ID}/questions`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .expect(403);
  });

  it('memvalidasi transisi State Machine Paket Ujian di backend', async () => {
    const examRes = await request(app.getHttpServer())
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        subjectId: SEED_IDS.SUBJECT_MATEMATIKA_ID,
        academicYearId: SEED_IDS.ACADEMIC_YEAR_ID,
        title: 'Ujian State Machine Test',
        code: 'TKA-SM-001',
        durationMinutes: 60,
        questionIds: [SEED_IDS.Q1_SINGLE_CHOICE_ID, SEED_IDS.Q2_COMPLEX_CHOICE_ID],
      })
      .expect(201);

    const examId = examRes.body.id;
    expect(examRes.body.status).toBe('DRAFT');

    // Transisi tidak valid: DRAFT -> SUBMITTED harus ditolak (400)
    await request(app.getHttpServer())
      .post(`/api/v1/exams/${examId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'SUBMITTED' })
      .expect(400);

    // Transisi valid: DRAFT -> SCHEDULED -> READY
    await request(app.getHttpServer())
      .post(`/api/v1/exams/${examId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'SCHEDULED' })
      .expect(201);

    const readyRes = await request(app.getHttpServer())
      .post(`/api/v1/exams/${examId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'READY' })
      .expect(201);
    expect(readyRes.body.status).toBe('READY');
  });
});
