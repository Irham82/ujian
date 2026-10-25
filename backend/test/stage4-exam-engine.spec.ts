import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createConfiguredApp } from '../src/main';
import { SEED_IDS } from '../src/database/seed';
import { DatabaseService } from '../src/database/database.service';

describe('Tahap 4 — Mesin Ujian, Proteksi Kunci Jawaban, Autosave Idempoten, Timer Server & Penilaian', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let student1Token = '';
  let student2Token = '';
  let teacherMtkToken = '';
  let supervisorToken = '';

  beforeAll(async () => {
    process.env.DATABASE_URL = 'pglite://memory';
    process.env.REDIS_URL = 'memory://localhost:6379';
    app = await createConfiguredApp();
    await app.init();
    db = app.get(DatabaseService);

    const loginAs = async (username: string) => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ username, password: 'CbtPro#2026' })
        .expect(201);
      return res.body.accessToken as string;
    };

    student1Token = await loginAs('siswa.andi');
    student2Token = await loginAs('siswa.nadia');
    teacherMtkToken = await loginAs('guru.matematika');
    supervisorToken = await loginAs('pengawas.ruang1');
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('memulai sesi ujian, mengembalikan timer server UTC, dan TIDAK membocorkan kunci jawaban di API siswa', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/student/exams/${SEED_IDS.SESSION_LAB_1_ID}/device-check`)
      .set('Authorization', `Bearer ${student1Token}`)
      .send({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0',
        indexedDbSupported: true,
      })
      .expect(201);

    const startRes = await request(app.getHttpServer())
      .post(`/api/v1/student/exams/${SEED_IDS.SESSION_LAB_1_ID}/start`)
      .set('Authorization', `Bearer ${student1Token}`)
      .expect(201);

    expect(startRes.body.status).toBe('IN_PROGRESS');
    expect(startRes.body.remainingSeconds).toBeGreaterThan(5000);

    const paperRes = await request(app.getHttpServer())
      .get(`/api/v1/student/participants/${SEED_IDS.PARTICIPANT_STUDENT_1_ID}/paper`)
      .set('Authorization', `Bearer ${student1Token}`)
      .expect(200);

    expect(paperRes.body.questions.length).toBe(5);
    const rawJson = JSON.stringify(paperRes.body.questions);
    expect(rawJson).not.toContain('answerKey');
    expect(rawJson).not.toContain('answer_key');
    expect(rawJson).not.toContain('isCorrect');
    expect(rawJson).not.toContain('is_correct');
    expect(rawJson).not.toContain('explanation');
  });

  it('mencegah Siswa 2 membaca naskah atau mengubah jawaban milik Siswa 1 (IDOR Protection)', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/student/participants/${SEED_IDS.PARTICIPANT_STUDENT_1_ID}/paper`)
      .set('Authorization', `Bearer ${student2Token}`)
      .expect(403);

    await request(app.getHttpServer())
      .put(`/api/v1/student/participants/${SEED_IDS.PARTICIPANT_STUDENT_1_ID}/answers`)
      .set('Authorization', `Bearer ${student2Token}`)
      .send({
        questionId: SEED_IDS.Q1_SINGLE_CHOICE_ID,
        answerPayload: { selectedOption: 'A' },
        idempotencyKey: 'idor-attempt-key-1',
      })
      .expect(403);
  });

  it('menyimpan jawaban secara transaksional, mendukung idempotency_key, dan mendeteksi konflik versi', async () => {
    // 1. Simpan jawaban PG 1 Jawaban (Q1 -> C benar)
    const save1 = await request(app.getHttpServer())
      .put(`/api/v1/student/participants/${SEED_IDS.PARTICIPANT_STUDENT_1_ID}/answers`)
      .set('Authorization', `Bearer ${student1Token}`)
      .send({
        questionId: SEED_IDS.Q1_SINGLE_CHOICE_ID,
        answerPayload: { selectedOption: 'C' },
        isMarkedForReview: false,
        idempotencyKey: 'idem-q1-v1',
      })
      .expect(200);

    expect(save1.body.status).toBe('SAVED_ON_SERVER');
    expect(save1.body.answerVersion).toBe(1);
    expect(save1.body.idempotentReplay).toBe(false);

    // 2. Replay dengan idempotencyKey yang sama -> tidak menaikkan versi
    const replay1 = await request(app.getHttpServer())
      .put(`/api/v1/student/participants/${SEED_IDS.PARTICIPANT_STUDENT_1_ID}/answers`)
      .set('Authorization', `Bearer ${student1Token}`)
      .send({
        questionId: SEED_IDS.Q1_SINGLE_CHOICE_ID,
        answerPayload: { selectedOption: 'C' },
        isMarkedForReview: false,
        idempotencyKey: 'idem-q1-v1',
      })
      .expect(200);

    expect(replay1.body.idempotentReplay).toBe(true);
    expect(replay1.body.answerVersion).toBe(1);

    // 3. Simpan Q2 (PG Kompleks -> ['A', 'C'] benar), Q3 (Benar-Salah -> TRUE benar), Q4 (Isian Singkat -> '30' benar), Q5 (Esai)
    await request(app.getHttpServer())
      .put(`/api/v1/student/participants/${SEED_IDS.PARTICIPANT_STUDENT_1_ID}/answers`)
      .set('Authorization', `Bearer ${student1Token}`)
      .send({
        questionId: SEED_IDS.Q2_COMPLEX_CHOICE_ID,
        answerPayload: { selectedOptions: ['A', 'C'] },
        idempotencyKey: 'idem-q2-v1',
      })
      .expect(200);

    await request(app.getHttpServer())
      .put(`/api/v1/student/participants/${SEED_IDS.PARTICIPANT_STUDENT_1_ID}/answers`)
      .set('Authorization', `Bearer ${student1Token}`)
      .send({
        questionId: SEED_IDS.Q3_TRUE_FALSE_ID,
        answerPayload: { selectedOption: 'TRUE' },
        idempotencyKey: 'idem-q3-v1',
      })
      .expect(200);

    await request(app.getHttpServer())
      .put(`/api/v1/student/participants/${SEED_IDS.PARTICIPANT_STUDENT_1_ID}/answers`)
      .set('Authorization', `Bearer ${student1Token}`)
      .send({
        questionId: SEED_IDS.Q4_SHORT_ANSWER_ID,
        answerPayload: { text: '30' },
        idempotencyKey: 'idem-q4-v1',
      })
      .expect(200);

    await request(app.getHttpServer())
      .put(`/api/v1/student/participants/${SEED_IDS.PARTICIPANT_STUDENT_1_ID}/answers`)
      .set('Authorization', `Bearer ${student1Token}`)
      .send({
        questionId: SEED_IDS.Q5_ESSAY_ID,
        answerPayload: { text: 'Persamaan V(t) = 120 - 4t, sehingga saat V(t)=0 diperoleh t = 30 menit.' },
        idempotencyKey: 'idem-q5-v1',
      })
      .expect(200);
  });

  it('menjalankan pengumpulan akhir (submit) secara idempoten, menilai soal objektif otomatis (80 poin), dan menolak perubahan setelah submit', async () => {
    const sub1 = await request(app.getHttpServer())
      .post(`/api/v1/student/participants/${SEED_IDS.PARTICIPANT_STUDENT_1_ID}/submit`)
      .set('Authorization', `Bearer ${student1Token}`)
      .send({ idempotencyKey: 'submit-andi-001' })
      .expect(201);

    expect(sub1.body.status).toBe('SUBMITTED');
    expect(sub1.body.idempotentReplay).toBe(false);
    expect(sub1.body.score.autoScore).toBe(80); // 4 soal objektif x 20 poin = 80
    expect(sub1.body.gradingStatus).toBe('PENDING_MANUAL_ESSAY');

    // Request submit kedua (pengumpulan berulang) tidak boleh menggandakan submission
    const sub2 = await request(app.getHttpServer())
      .post(`/api/v1/student/participants/${SEED_IDS.PARTICIPANT_STUDENT_1_ID}/submit`)
      .set('Authorization', `Bearer ${student1Token}`)
      .send({ idempotencyKey: 'submit-andi-002' })
      .expect(201);

    expect(sub2.body.idempotentReplay).toBe(true);
    expect(sub2.body.submissionId).toBe(sub1.body.submissionId);

    const countRes = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM exam_submissions WHERE exam_participant_id = $1`,
      [SEED_IDS.PARTICIPANT_STUDENT_1_ID],
    );
    expect(Number(countRes.rows[0].count)).toBe(1);

    // Perubahan jawaban setelah submit wajib ditolak (409 Conflict)
    await request(app.getHttpServer())
      .put(`/api/v1/student/participants/${SEED_IDS.PARTICIPANT_STUDENT_1_ID}/answers`)
      .set('Authorization', `Bearer ${student1Token}`)
      .send({
        questionId: SEED_IDS.Q1_SINGLE_CHOICE_ID,
        answerPayload: { selectedOption: 'A' },
        idempotencyKey: 'late-edit-after-submit',
      })
      .expect(409);
  });

  it('menolak Pengawas mengubah nilai esai (403) dan mengizinkan Guru pengampu menilai esai serta mengunduh analisis butir soal', async () => {
    // Pengawas mencoba menilai esai -> 403 Forbidden
    await request(app.getHttpServer())
      .post(`/api/v1/grading/participants/${SEED_IDS.PARTICIPANT_STUDENT_1_ID}/essay`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({
        questionId: SEED_IDS.Q5_ESSAY_ID,
        scoreAwarded: 20,
      })
      .expect(403);

    // Guru Matematika menilai esai -> 200 OK, nilai total menjadi 100
    const gradeRes = await request(app.getHttpServer())
      .post(`/api/v1/grading/participants/${SEED_IDS.PARTICIPANT_STUDENT_1_ID}/essay`)
      .set('Authorization', `Bearer ${teacherMtkToken}`)
      .send({
        questionId: SEED_IDS.Q5_ESSAY_ID,
        scoreAwarded: 20,
        feedback: 'Langkah penyelesaian sangat tepat dan sistematis.',
      })
      .expect(201);

    expect(gradeRes.body.totalScore).toBe(100);
    expect(gradeRes.body.gradingStatus).toBe('FULLY_GRADED');

    // Analisis butir soal & laporan
    const analyticsRes = await request(app.getHttpServer())
      .get(`/api/v1/reports/exams/${SEED_IDS.EXAM_TKA_UTAMA_ID}/analytics`)
      .set('Authorization', `Bearer ${teacherMtkToken}`)
      .expect(200);

    expect(analyticsRes.body.summary.totalSubmissions).toBe(1);
    expect(analyticsRes.body.summary.averageScore).toBe(100);
    expect(analyticsRes.body.itemAnalysis.length).toBe(5);
  });
});
