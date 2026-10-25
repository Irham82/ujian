import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createConfiguredApp } from '../src/main';
import { SEED_IDS } from '../src/database/seed';
import { DatabaseService } from '../src/database/database.service';

describe('Tahap 5, 6, 7 & 8 — Anti-Kecurangan, Offline Sync (11 Skenario), SEB, Kamera Opsional & Backup/Restore', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let adminToken = '';
  let proctor1Token = '';
  let proctor2Token = '';
  let supervisor1Token = '';
  let student2Token = '';
  let student3Token = '';

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

    adminToken = await loginAs('admin');
    proctor1Token = await loginAs('proktor.utama'); // Assigned to SESSION_LAB_1_ID
    proctor2Token = await loginAs('proktor.kedua'); // Assigned to SESSION_LAB_2_ID
    supervisor1Token = await loginAs('pengawas.ruang1'); // Assigned to SESSION_LAB_1_ID
    student2Token = await loginAs('siswa.nadia'); // Enrolled in SESSION_LAB_1_ID
    student3Token = await loginAs('siswa.rizky'); // Enrolled in SESSION_LAB_2_ID
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('Tahap 5: menegakkan otorisasi objek untuk Proktor & Pengawas serta mencatat kehadiran, insiden, dan peringatan', async () => {
    // Proktor 1 mengakses Sesi Lab 1 (ditugaskan) -> 200 OK
    const summaryRes = await request(app.getHttpServer())
      .get(`/api/v1/monitoring/sessions/${SEED_IDS.SESSION_LAB_1_ID}/summary`)
      .set('Authorization', `Bearer ${proctor1Token}`)
      .expect(200);
    expect(summaryRes.body.metrics.totalParticipants).toBe(2);

    // Proktor 1 mencoba mengakses Sesi Lab 2 (di luar penugasan) -> 403 Forbidden
    await request(app.getHttpServer())
      .get(`/api/v1/monitoring/sessions/${SEED_IDS.SESSION_LAB_2_ID}/summary`)
      .set('Authorization', `Bearer ${proctor1Token}`)
      .expect(403);

    // Pengawas 1 mencatat kehadiran Siswa 2 di Lab 1 -> 201
    const attRes = await request(app.getHttpServer())
      .post(`/api/v1/monitoring/participants/${SEED_IDS.PARTICIPANT_STUDENT_2_ID}/attendance`)
      .set('Authorization', `Bearer ${supervisor1Token}`)
      .send({ status: 'PRESENT', notes: 'Hadir tepat waktu dengan laptop Windows' })
      .expect(201);
    expect(attRes.body.status).toBe('PRESENT');

    // Pengawas 1 membuat laporan kejadian ke Proktor -> 201
    const incRes = await request(app.getHttpServer())
      .post(`/api/v1/monitoring/sessions/${SEED_IDS.SESSION_LAB_1_ID}/incidents`)
      .set('Authorization', `Bearer ${supervisor1Token}`)
      .send({
        participantId: SEED_IDS.PARTICIPANT_STUDENT_2_ID,
        category: 'NETWORK_FLUCTUATION',
        severity: 'LOW',
        title: 'Sinyal Wi-Fi sempat melambat 15 detik',
        description: 'Siswa tetap berada di tempat duduk dan indikator buffer lokal aktif.',
      })
      .expect(201);
    expect(incRes.body.status).toBe('OPEN');

    // Pengawas 1 DILARANG melakukan intervensi proktor -> 403 Forbidden
    await request(app.getHttpServer())
      .post(`/api/v1/monitoring/participants/${SEED_IDS.PARTICIPANT_STUDENT_2_ID}/intervene`)
      .set('Authorization', `Bearer ${supervisor1Token}`)
      .send({ actionType: 'ADD_EXTRA_TIME', reason: 'Coba tambah waktu', extraTimeSeconds: 300 })
      .expect(403);

    // Proktor 1 mengirim peringatan resmi kepada Siswa 2 -> 201
    await request(app.getHttpServer())
      .post(`/api/v1/monitoring/participants/${SEED_IDS.PARTICIPANT_STUDENT_2_ID}/warning`)
      .set('Authorization', `Bearer ${proctor1Token}`)
      .send({ message: 'Harap fokus pada layar ujian Anda.' })
      .expect(201);
  });

  it('Tahap 5 & 6: menguji siklus penuh Mode Offline Terbatas, Konflik Versi, Grace Period, dan Pencabutan Sesi', async () => {
    // Siswa 2 mulai ujian secara online
    await request(app.getHttpServer())
      .post(`/api/v1/student/exams/${SEED_IDS.SESSION_LAB_1_ID}/start`)
      .set('Authorization', `Bearer ${student2Token}`)
      .expect(201);

    // Simpan jawaban Q1 versi 1 secara online
    await request(app.getHttpServer())
      .put(`/api/v1/student/participants/${SEED_IDS.PARTICIPANT_STUDENT_2_ID}/answers`)
      .set('Authorization', `Bearer ${student2Token}`)
      .send({
        questionId: SEED_IDS.Q1_SINGLE_CHOICE_ID,
        answerPayload: { selectedOption: 'A' },
        idempotencyKey: 'nadia-online-q1-v1',
      })
      .expect(200);

    // Simulasi koneksi terputus & event keamanan tercatat saat reconnect
    await request(app.getHttpServer())
      .post('/api/v1/security/events')
      .set('Authorization', `Bearer ${student2Token}`)
      .send({
        participantId: SEED_IDS.PARTICIPANT_STUDENT_2_ID,
        eventType: 'CONNECTION_INTERRUPTED',
        metadata: { bufferedItems: 3 },
      })
      .expect(201);

    // Sinkronisasi batch offline (melewati grace period 120 detik -> 150 detik, dan mengandung konflik versi pada Q1 karena expectedVersion: 0 < serverVersion: 1)
    const syncRes = await request(app.getHttpServer())
      .post(`/api/v1/student/participants/${SEED_IDS.PARTICIPANT_STUDENT_2_ID}/offline-sync`)
      .set('Authorization', `Bearer ${student2Token}`)
      .send({
        batchIdempotencyKey: 'nadia-offline-batch-001',
        offlineDurationSeconds: 150,
        items: [
          {
            questionId: SEED_IDS.Q1_SINGLE_CHOICE_ID,
            answerPayload: { selectedOption: 'C' },
            expectedVersion: 0, // sengaja lebih kecil dari versi server (1) untuk menguji penanganan konflik
            idempotencyKey: 'nadia-offline-q1-v2',
          },
          {
            questionId: SEED_IDS.Q2_COMPLEX_CHOICE_ID,
            answerPayload: { selectedOptions: ['A', 'C'] },
            idempotencyKey: 'nadia-offline-q2-v1',
          },
          {
            questionId: '00000000-0000-4000-8000-999999999999', // Soal tidak sah di luar ujian
            answerPayload: { selectedOption: 'B' },
            idempotencyKey: 'nadia-offline-invalid-q',
          },
        ],
      })
      .expect(201);

    expect(syncRes.body.acceptedCount).toBe(2);
    expect(syncRes.body.conflictCount).toBe(1);
    expect(syncRes.body.rejectedCount).toBe(1);
    expect(syncRes.body.exceededGracePeriod).toBe(true);
    expect(syncRes.body.gracePeriodWarning).toContain('melewati batas toleransi');

    // Retry batch yang sama (idempotent replay)
    const replayBatch = await request(app.getHttpServer())
      .post(`/api/v1/student/participants/${SEED_IDS.PARTICIPANT_STUDENT_2_ID}/offline-sync`)
      .set('Authorization', `Bearer ${student2Token}`)
      .send({
        batchIdempotencyKey: 'nadia-offline-batch-001',
        offlineDurationSeconds: 150,
        items: [],
      })
      .expect(201);
    expect(replayBatch.body.idempotentReplay).toBe(true);

    // Jika sesi dijeda/dicabut oleh Proktor saat offline, sinkronisasi batch baru harus ditolak (403)
    await request(app.getHttpServer())
      .post(`/api/v1/monitoring/participants/${SEED_IDS.PARTICIPANT_STUDENT_2_ID}/intervene`)
      .set('Authorization', `Bearer ${proctor1Token}`)
      .send({ actionType: 'PAUSE_SESSION', reason: 'Pemeriksaan perangkat oleh proktor' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/student/participants/${SEED_IDS.PARTICIPANT_STUDENT_2_ID}/offline-sync`)
      .set('Authorization', `Bearer ${student2Token}`)
      .send({
        batchIdempotencyKey: 'nadia-offline-batch-while-paused',
        offlineDurationSeconds: 20,
        items: [
          {
            questionId: SEED_IDS.Q3_TRUE_FALSE_ID,
            answerPayload: { selectedOption: 'TRUE' },
            idempotencyKey: 'nadia-offline-q3-v1',
          },
        ],
      })
      .expect(403);

    // Proktor memulihkan sesi kembali (RESUME_SESSION)
    await request(app.getHttpServer())
      .post(`/api/v1/monitoring/participants/${SEED_IDS.PARTICIPANT_STUDENT_2_ID}/intervene`)
      .set('Authorization', `Bearer ${proctor1Token}`)
      .send({ actionType: 'RESUME_SESSION', reason: 'Pemeriksaan selesai, sesi dilanjutkan' })
      .expect(201);
  });

  it('Tahap 6 & 7: menegakkan kebijakan Safe Exam Browser (SEB) dan Kamera Opsional beserta pengecualian Proktor & audit akses kamera', async () => {
    // Admin mengaktifkan SECURE_BROWSER_REQUIRED dan camera_enabled pada ujian
    await request(app.getHttpServer())
      .patch(`/api/v1/exams/${SEED_IDS.EXAM_TKA_UTAMA_ID}/security-policy`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        browserPolicy: 'SECURE_BROWSER_REQUIRED',
        sebConfigKeyHash: 'expected-seb-hash-2026',
        cameraEnabled: true,
        cameraRetentionDays: 7,
      })
      .expect(200);

    // Siswa 3 (Rizky, di Sesi Lab 2) memeriksa perangkat dari HP Android biasa tanpa kamera -> tidak memenuhi syarat SEB & kamera
    const devCheckAndroid = await request(app.getHttpServer())
      .post(`/api/v1/student/exams/${SEED_IDS.SESSION_LAB_2_ID}/device-check`)
      .set('Authorization', `Bearer ${student3Token}`)
      .send({
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/130.0 Mobile',
        cameraAvailable: false,
        cameraConsentGiven: false,
      })
      .expect(201);

    expect(devCheckAndroid.body.osPlatform).toBe('ANDROID');
    expect(devCheckAndroid.body.sebSupportedOnPlatform).toBe(false);
    expect(devCheckAndroid.body.allowedToStart).toBe(false);

    // Mencoba mulai ujian langsung tanpa SEB & tanpa persetujuan alternatif -> ditolak (403)
    await request(app.getHttpServer())
      .post(`/api/v1/student/exams/${SEED_IDS.SESSION_LAB_2_ID}/start`)
      .set('Authorization', `Bearer ${student3Token}`)
      .expect(403);

    // Proktor 2 memberikan pengecualian resmi SEB dan persetujuan pengawasan fisik alternatif kamera (tercatat di audit_logs)
    await request(app.getHttpServer())
      .post(`/api/v1/monitoring/participants/${SEED_IDS.PARTICIPANT_STUDENT_3_ID}/intervene`)
      .set('Authorization', `Bearer ${proctor2Token}`)
      .send({
        actionType: 'APPROVE_SEB_EXCEPTION',
        reason: 'Peserta menggunakan HP Android BYOD di bawah pengawasan langsung pengawas ruang Lab 2',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/monitoring/participants/${SEED_IDS.PARTICIPANT_STUDENT_3_ID}/intervene`)
      .set('Authorization', `Bearer ${proctor2Token}`)
      .send({
        actionType: 'APPROVE_CAMERA_ALTERNATIVE',
        reason: 'Kamera perangkat rusak, diawasi langsung di meja baris depan oleh Pengawas Ruang 2',
      })
      .expect(201);

    // Sekarang Siswa 3 diizinkan memulai ujian
    const startAfterOverride = await request(app.getHttpServer())
      .post(`/api/v1/student/exams/${SEED_IDS.SESSION_LAB_2_ID}/start`)
      .set('Authorization', `Bearer ${student3Token}`)
      .expect(201);
    expect(startAfterOverride.body.status).toBe('IN_PROGRESS');

    // Setiap akses data kamera oleh Proktor tercatat di audit_logs
    const camAudit = await request(app.getHttpServer())
      .get(`/api/v1/monitoring/participants/${SEED_IDS.PARTICIPANT_STUDENT_3_ID}/camera-audit`)
      .set('Authorization', `Bearer ${proctor2Token}`)
      .expect(200);
    expect(camAudit.body.auditLogged).toBe(true);
    expect(camAudit.body.cameraSupervisionActive).toBe(false); // jujur: tidak mengklaim diawasi kamera karena menggunakan prosedur alternatif

    // Kembalikan kebijakan ke STANDARD_BROWSER & cameraEnabled=false untuk pengujian berikutnya
    await request(app.getHttpServer())
      .patch(`/api/v1/exams/${SEED_IDS.EXAM_TKA_UTAMA_ID}/security-policy`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        browserPolicy: 'STANDARD_BROWSER',
        cameraEnabled: false,
      })
      .expect(200);
  });

  it('Tahap 8: menolak jawaban saat waktu ujian berakhir ketika offline dan memverifikasi Backup & Restore terenkripsi', async () => {
    // Simulasikan batas waktu server Siswa 3 telah kedaluwarsa saat perangkat sedang offline
    const expiredDeadline = new Date(Date.now() - 60 * 1000).toISOString();
    await db.query(
      `UPDATE exam_participants SET server_deadline_at = $2, extra_time_seconds = 0 WHERE id = $1`,
      [SEED_IDS.PARTICIPANT_STUDENT_3_ID, expiredDeadline],
    );

    // Siswa 3 mencoba sinkronisasi jawaban offline setelah waktu server habis -> ditolak 409 (REJECTED_EXPIRED)
    await request(app.getHttpServer())
      .post(`/api/v1/student/participants/${SEED_IDS.PARTICIPANT_STUDENT_3_ID}/offline-sync`)
      .set('Authorization', `Bearer ${student3Token}`)
      .send({
        batchIdempotencyKey: 'rizky-expired-offline-batch',
        offlineDurationSeconds: 90,
        items: [
          {
            questionId: SEED_IDS.Q1_SINGLE_CHOICE_ID,
            answerPayload: { selectedOption: 'C' },
            idempotencyKey: 'rizky-late-q1',
          },
        ],
      })
      .expect(409);

    // Buat Backup Database Terenkripsi (AES-256-GCM) melalui endpoint Admin
    const backupRes = await request(app.getHttpServer())
      .post('/api/v1/admin/backup')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    expect(backupRes.body.encryptedPayload).toBeDefined();
    const answersBefore = backupRes.body.tableCounts.participant_answers;
    expect(answersBefore).toBeGreaterThan(0);

    // Restore dari backup terenkripsi dan pastikan seluruh jawaban tetap utuh
    const restoreRes = await request(app.getHttpServer())
      .post('/api/v1/admin/restore')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ encryptedPayload: backupRes.body.encryptedPayload })
      .expect(201);

    expect(restoreRes.body.restoredTables).toBe(31);

    const afterCount = await db.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM participant_answers',
    );
    expect(Number(afterCount.rows[0].count)).toBe(answersBefore);
  });
});
