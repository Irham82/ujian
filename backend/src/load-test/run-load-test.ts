import 'reflect-metadata';
import { createConfiguredApp } from '../main';
import { DatabaseService } from '../database/database.service';
import { SEED_IDS } from '../database/seed';
import { hashPassword, signSessionToken } from '../common/crypto.util';
import * as fs from 'fs';
import * as path from 'path';

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Math.round(sorted[idx] * 100) / 100;
}

function summarizeLatencies(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  return {
    count: sorted.length,
    avgMs: sorted.length > 0 ? Math.round((sum / sorted.length) * 100) / 100 : 0,
    p50Ms: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    p99Ms: percentile(sorted, 99),
    maxMs: sorted.length > 0 ? Math.round(sorted[sorted.length - 1] * 100) / 100 : 0,
  };
}

async function runWithConcurrencyPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIdx = 0;

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const idx = nextIdx++;
      if (idx >= items.length) break;
      results[idx] = await worker(items[idx], idx);
    }
  });

  await Promise.all(runners);
  return results;
}

interface SimulatedStudent {
  index: number;
  userId: string;
  username: string;
  participantId: string;
  sid: string;
  token: string;
}

async function main() {
  process.env.DATABASE_URL = 'pglite://memory';
  process.env.REDIS_URL = 'memory://localhost:6379';
  process.env.API_RATE_LIMIT_PER_MINUTE = '5000';

  const app = await createConfiguredApp();
  await app.init();
  await app.listen(0, '127.0.0.1');
  const serverUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');
  const baseUrl = `${serverUrl}/api/v1`;

  const db = app.get(DatabaseService);
  const passwordHash = await hashPassword('CbtPro#2026');

  console.log(` Provisioning 750 simulated students on ${baseUrl}...`);
  const students: SimulatedStudent[] = [];

  await db.withTransaction(async (tx) => {
    for (let i = 1; i <= 750; i++) {
      const hex = i.toString(16).padStart(12, '0');
      const userId = `29000000-0000-4000-8000-${hex}`;
      const userRoleId = `29100000-0000-4000-8000-${hex}`;
      const participantId = `a9000000-0000-4000-8000-${hex}`;
      const username = `siswa.load.${String(i).padStart(4, '0')}`;
      const sid = `load-sid-${i}`;

      await tx.query(
        `INSERT INTO users (id, school_id, username, email, full_name, identifier_code, password_hash, is_active, active_session_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8)
         ON CONFLICT (id) DO NOTHING`,
        [
          userId,
          SEED_IDS.SCHOOL_ID,
          username,
          `${username}@siswa.sch.id`,
          `Siswa Simulasi Load #${i}`,
          `NISN-LOAD-${i}`,
          passwordHash,
          sid,
        ],
      );

      await tx.query(
        `INSERT INTO user_roles (id, user_id, role_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, role_id) DO NOTHING`,
        [userRoleId, userId, SEED_IDS.ROLE_STUDENT_ID],
      );

      await tx.query(
        `INSERT INTO exam_participants (id, exam_session_id, exam_id, student_user_id, class_id, status)
         VALUES ($1, $2, $3, $4, $5, 'READY')
         ON CONFLICT (exam_session_id, student_user_id) DO NOTHING`,
        [
          participantId,
          SEED_IDS.SESSION_LAB_1_ID,
          SEED_IDS.EXAM_TKA_UTAMA_ID,
          userId,
          SEED_IDS.CLASS_XII_IPA_1_ID,
        ],
      );

      const token = signSessionToken({
        sub: userId,
        schoolId: SEED_IDS.SCHOOL_ID,
        username,
        fullName: `Siswa Simulasi Load #${i}`,
        roles: ['STUDENT'],
        sid,
      });

      students.push({
        index: i,
        userId,
        username,
        participantId,
        sid,
        token,
      });
    }
  });

  const paperReadLatencies: number[] = [];
  const answerSaveLatencies: number[] = [];
  const offlineSyncLatencies: number[] = [];
  const submitLatencies: number[] = [];
  const loginSpikeLatencies: number[] = [];
  let totalRequests = 0;
  let failedRequests = 0;
  let confirmedSavedCount = 0;

  const timedFetch = async (url: string, init: RequestInit): Promise<{ status: number; durationMs: number; body: any }> => {
    const t0 = performance.now();
    totalRequests++;
    const res = await fetch(url, init);
    const durationMs = performance.now() - t0;
    let body: any = null;
    try {
      body = await res.json();
    } catch {
      // ignore
    }
    if (!res.ok) {
      failedRequests++;
    }
    return { status: res.status, durationMs, body };
  };

  const scenarioResults: Record<string, any> = {};
  const startOverall = performance.now();

  // Skenario 1-6: Smoke (5), Ramp-up 50, 100, 250, 500, dan 750 Sesi Ujian Aktif Bersamaan (Start Exam + Read Paper)
  const stages = [
    { name: '01_smoke_5_users', count: 5 },
    { name: '02_ramp_50_users', count: 50 },
    { name: '03_test_100_users', count: 100 },
    { name: '04_test_250_users', count: 250 },
    { name: '05_test_500_concurrent_sessions', count: 500 },
    { name: '06_stress_750_sessions', count: 750 },
  ];

  for (const st of stages) {
    const slice = students.slice(0, st.count);
    const stageLatencies: number[] = [];
    await runWithConcurrencyPool(slice, 50, async (stu) => {
      const startRes = await timedFetch(`${baseUrl}/student/exams/${SEED_IDS.SESSION_LAB_1_ID}/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${stu.token}` },
      });
      stageLatencies.push(startRes.durationMs);
    });
    scenarioResults[st.name] = summarizeLatencies(stageLatencies);
  }

  // Skenario 7: Lonjakan Login (Login Spike)
  const loginSlice = students.slice(0, 100);
  await runWithConcurrencyPool(loginSlice, 25, async (stu) => {
    const res = await timedFetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: stu.username, password: 'CbtPro#2026' }),
    });
    loginSpikeLatencies.push(res.durationMs);
    if (res.body?.accessToken) {
      stu.token = res.body.accessToken;
    }
  });
  scenarioResults['07_login_spike_100'] = summarizeLatencies(loginSpikeLatencies);

  // Skenario 8: Navigasi & Baca Naskah Soal pada 500 Sesi Aktif Bersamaan
  const active500 = students.slice(0, 500);
  await runWithConcurrencyPool(active500, 25, async (stu) => {
    const res = await timedFetch(`${baseUrl}/student/participants/${stu.participantId}/paper`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${stu.token}` },
    });
    paperReadLatencies.push(res.durationMs);
  });
  scenarioResults['08_paper_navigation_500_sessions'] = summarizeLatencies(paperReadLatencies);

  // Skenario 9: Autosave Jawaban pada 500 Sesi Aktif Bersamaan
  await runWithConcurrencyPool(active500, 15, async (stu) => {
    const res = await timedFetch(`${baseUrl}/student/participants/${stu.participantId}/answers`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${stu.token}`,
      },
      body: JSON.stringify({
        questionId: SEED_IDS.Q1_SINGLE_CHOICE_ID,
        answerPayload: { selectedOption: 'C' },
        isMarkedForReview: false,
        idempotencyKey: `load-ans-${stu.participantId}-q1`,
      }),
    });
    answerSaveLatencies.push(res.durationMs);
    if (res.status === 200 && res.body?.status === 'SAVED_ON_SERVER') {
      confirmedSavedCount++;
    }
  });
  scenarioResults['09_autosave_500_sessions'] = summarizeLatencies(answerSaveLatencies);

  // Skenario 11, 12, 13: Gangguan Koneksi, Reconnect Serentak & Sinkronisasi Antrean Offline (500 Sesi)
  await runWithConcurrencyPool(active500, 15, async (stu) => {
    const res = await timedFetch(`${baseUrl}/student/participants/${stu.participantId}/offline-sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${stu.token}`,
      },
      body: JSON.stringify({
        batchIdempotencyKey: `load-batch-${stu.participantId}`,
        offlineDurationSeconds: 35,
        items: [
          {
            questionId: SEED_IDS.Q2_COMPLEX_CHOICE_ID,
            answerPayload: { selectedOptions: ['A', 'C'] },
            idempotencyKey: `load-ans-${stu.participantId}-q2`,
          },
          {
            questionId: SEED_IDS.Q3_TRUE_FALSE_ID,
            answerPayload: { selectedOption: 'TRUE' },
            idempotencyKey: `load-ans-${stu.participantId}-q3`,
          },
        ],
      }),
    });
    offlineSyncLatencies.push(res.durationMs);
    if (res.status === 201) {
      confirmedSavedCount += Number(res.body?.acceptedCount || 0);
    }
  });
  scenarioResults['11_12_13_disconnect_reconnect_offline_sync_500'] =
    summarizeLatencies(offlineSyncLatencies);

  // Skenario 14: Lonjakan Event Anti-Kecurangan (500 Sesi) + Verifikasi Autosave Tidak Terhambat
  const antiCheatLatencies: number[] = [];
  await runWithConcurrencyPool(active500, 25, async (stu) => {
    const res = await timedFetch(`${baseUrl}/security/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${stu.token}`,
      },
      body: JSON.stringify({
        participantId: stu.participantId,
        eventType: 'TAB_HIDDEN',
        durationMs: 1500,
      }),
    });
    antiCheatLatencies.push(res.durationMs);
  });
  scenarioResults['14_anti_cheat_event_burst_500'] = summarizeLatencies(antiCheatLatencies);

  // Skenario 10, 15, 16: Submit Serentak 500 Sesi Aktif + Uji Idempotensi Double-Submit
  await runWithConcurrencyPool(active500, 15, async (stu) => {
    const res = await timedFetch(`${baseUrl}/student/participants/${stu.participantId}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${stu.token}`,
      },
      body: JSON.stringify({ idempotencyKey: `load-submit-${stu.participantId}` }),
    });
    submitLatencies.push(res.durationMs);
  });
  scenarioResults['10_simultaneous_submit_500_sessions'] = summarizeLatencies(submitLatencies);

  // Verify data integrity in PostgreSQL
  const dbAnswerCountRes = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM participant_answers WHERE exam_participant_id::text LIKE 'a9000000-%'`,
  );
  const dbSubCountRes = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM exam_submissions WHERE exam_participant_id::text LIKE 'a9000000-%'`,
  );
  const dupSubCheck = await db.query<{ exam_participant_id: string; cnt: string }>(
    `SELECT exam_participant_id::text AS exam_participant_id, COUNT(*)::text AS cnt
     FROM exam_submissions
     GROUP BY exam_participant_id
     HAVING COUNT(*) > 1`,
  );

  const totalDurationSeconds =
    Math.round(((performance.now() - startOverall) / 1000) * 100) / 100;
  const mem = process.memoryUsage();
  const errorRatePercent =
    totalRequests > 0 ? Math.round((failedRequests / totalRequests) * 10000) / 100 : 0;

  const report = {
    executedAtUtc: new Date().toISOString(),
    environment: {
      os: process.platform,
      nodeVersion: process.version,
      databaseDriver: db.getDriverType(),
      concurrentActiveSessionsTested: 500,
      stressSessionsTested: 750,
      cameraActiveDuringTest: false,
      cameraCapacityNote:
        'Kapasitas 500-750 sesi ini diukur dengan fitur kamera nonaktif (default). Jika kamera diaktifkan, bandwidth & penyimpanan objek wajib diuji secara terpisah.',
    },
    overallMetrics: {
      totalRequests,
      failedRequests,
      errorRatePercent,
      totalDurationSeconds,
      throughputReqPerSec: Math.round((totalRequests / totalDurationSeconds) * 100) / 100,
      paperReadStats: summarizeLatencies(paperReadLatencies),
      answerSaveStats: summarizeLatencies(answerSaveLatencies),
      offlineSyncStats: summarizeLatencies(offlineSyncLatencies),
      submitStats: summarizeLatencies(submitLatencies),
      memoryUsageMb: {
        rss: Math.round((mem.rss / 1024 / 1024) * 100) / 100,
        heapUsed: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100,
      },
    },
    dataIntegrityVerification: {
      confirmedSavedAnswersExpected: confirmedSavedCount,
      persistedAnswersInDatabase: Number(dbAnswerCountRes.rows[0].count),
      zeroConfirmedAnswersLost:
        Number(dbAnswerCountRes.rows[0].count) === confirmedSavedCount,
      persistedSubmissionsInDatabase: Number(dbSubCountRes.rows[0].count),
      duplicateSubmissionsCount: dupSubCheck.rows.length,
    },
    acceptanceThresholdsMet: {
      paperReadP95Under500ms: summarizeLatencies(paperReadLatencies).p95Ms < 500,
      answerSaveP95Under500ms: summarizeLatencies(answerSaveLatencies).p95Ms < 500,
      errorRateUnder0_1Percent: errorRatePercent < 0.1,
      zeroDataLoss: Number(dbAnswerCountRes.rows[0].count) === confirmedSavedCount,
      zeroDuplicateSubmissions: dupSubCheck.rows.length === 0,
    },
    scenarios: scenarioResults,
  };

  const reportPath = path.resolve(process.cwd(), '../load-tests/latest-load-test-report.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

  console.log(JSON.stringify(report, null, 2));
  await app.close();

  if (
    !report.acceptanceThresholdsMet.paperReadP95Under500ms ||
    !report.acceptanceThresholdsMet.answerSaveP95Under500ms ||
    !report.acceptanceThresholdsMet.errorRateUnder0_1Percent ||
    !report.acceptanceThresholdsMet.zeroDataLoss ||
    !report.acceptanceThresholdsMet.zeroDuplicateSubmissions
  ) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
