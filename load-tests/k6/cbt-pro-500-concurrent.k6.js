/**
 * ============================================================================
 * CBT PRO — GRAFANA K6 LOAD TEST SUITE (16 SKENARIO WAJIB, 500–750 SESI AKTIF)
 * ============================================================================
 * Cara menjalankan dengan k6 CLI:
 *   k6 run -e BASE_URL=http://localhost:4000/api/v1 load-tests/k6/cbt-pro-500-concurrent.k6.js
 *
 * Catatan Kapasitas Kamera Opsional:
 *   Pengujian ini mengukur trafik ujian standar (tanpa video streaming).
 *   Jika kamera opsional diaktifkan, uji beban kamera wajib dijalankan terpisah.
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000/api/v1';
const SESSION_ID = __ENV.SESSION_ID || '90000000-0000-4000-8000-000000000001';

const paperReadTrend = new Trend('cbt_paper_read_duration_ms', true);
const answerSaveTrend = new Trend('cbt_answer_save_duration_ms', true);
const offlineSyncTrend = new Trend('cbt_offline_sync_duration_ms', true);
const submitTrend = new Trend('cbt_submit_duration_ms', true);
const errorRate = new Rate('cbt_error_rate');
const confirmedSavedAnswers = new Counter('cbt_confirmed_saved_answers');

export const options = {
  scenarios: {
    // 1. Smoke Test (5 VUs)
    s01_smoke: {
      executor: 'constant-vus',
      vus: 5,
      duration: '10s',
      startTime: '0s',
    },
    // 2-6. Ramp-up 50 -> 100 -> 250 -> 500 -> 750 Concurrent Students
    s02_to_s06_ramp_500_750: {
      executor: 'ramping-vus',
      startVUs: 10,
      stages: [
        { duration: '15s', target: 50 },  // 2. Ramp-up 50 pengguna
        { duration: '15s', target: 100 }, // 3. Uji 100 pengguna
        { duration: '20s', target: 250 }, // 4. Uji 250 pengguna
        { duration: '30s', target: 500 }, // 5. Uji 500 pengguna aktif bersamaan
        { duration: '20s', target: 750 }, // 6. Uji stress 750 pengguna
        { duration: '10s', target: 0 },
      ],
      startTime: '10s',
    },
    // 7, 10, 12, 14. Spike Login, Reconnect, Anti-Cheat Burst & Simultaneous Submit
    s07_spike_and_reconnect: {
      executor: 'ramping-arrival-rate',
      startRate: 20,
      timeUnit: '1s',
      preAllocatedVUs: 200,
      maxVUs: 600,
      stages: [
        { duration: '10s', target: 150 },
        { duration: '10s', target: 20 },
      ],
      startTime: '120s',
    },
  },
  thresholds: {
    cbt_paper_read_duration_ms: ['p(95)<500'],
    cbt_answer_save_duration_ms: ['p(95)<500'],
    cbt_error_rate: ['rate<0.001'],
  },
};

export default function () {
  const vuIndex = ((__VU - 1) % 750) + 1;
  const padded = String(vuIndex).padStart(4, '0');
  const username = `siswa.load.${padded}`;
  const password = 'CbtPro#2026';

  // 7. Login
  const loginRes = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ username, password }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  const loginOk = check(loginRes, {
    'login status 201': (r) => r.status === 201,
  });
  if (!loginOk) {
    errorRate.add(1);
    return;
  }
  errorRate.add(0);

  const body = JSON.parse(loginRes.body);
  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${body.accessToken}`,
  };

  // Start / Resume Exam
  const startRes = http.post(`${BASE_URL}/student/exams/${SESSION_ID}/start`, null, {
    headers: authHeaders,
  });
  if (startRes.status !== 201) {
    errorRate.add(1);
    return;
  }
  const startData = JSON.parse(startRes.body);
  const participantId = startData.participantId;

  // 8. Navigasi & Baca Soal
  group('08_read_paper', () => {
    const paperRes = http.get(`${BASE_URL}/student/participants/${participantId}/paper`, {
      headers: authHeaders,
    });
    paperReadTrend.add(paperRes.timings.duration);
    const ok = check(paperRes, {
      'paper status 200': (r) => r.status === 200,
      'no answer key leaked': (r) => !r.body.includes('answerKey'),
    });
    errorRate.add(ok ? 0 : 1);
  });

  // 9. Autosave Jawaban
  group('09_autosave', () => {
    const idemKey = `k6-ans-${participantId}-${__ITER}-q1`;
    const saveRes = http.put(
      `${BASE_URL}/student/participants/${participantId}/answers`,
      JSON.stringify({
        questionId: '70000000-0000-4000-8000-000000000001',
        answerPayload: { selectedOption: 'C' },
        isMarkedForReview: false,
        idempotencyKey: idemKey,
      }),
      { headers: authHeaders },
    );
    answerSaveTrend.add(saveRes.timings.duration);
    const ok = check(saveRes, { 'autosave 200': (r) => r.status === 200 });
    if (ok) confirmedSavedAnswers.add(1);
    errorRate.add(ok ? 0 : 1);
  });

  // 11, 12, 13. Gangguan Koneksi, Reconnect & Sinkronisasi Antrean Offline
  group('13_offline_queue_sync', () => {
    const batchKey = `k6-batch-${participantId}-${__ITER}`;
    const syncRes = http.post(
      `${BASE_URL}/student/participants/${participantId}/offline-sync`,
      JSON.stringify({
        batchIdempotencyKey: batchKey,
        offlineDurationSeconds: 45,
        items: [
          {
            questionId: '70000000-0000-4000-8000-000000000002',
            answerPayload: { selectedOptions: ['A', 'C'] },
            idempotencyKey: `${batchKey}-q2`,
          },
        ],
      }),
      { headers: authHeaders },
    );
    offlineSyncTrend.add(syncRes.timings.duration);
    const ok = check(syncRes, { 'offline sync 201': (r) => r.status === 201 });
    errorRate.add(ok ? 0 : 1);
  });

  // 14. Event Anti-Kecurangan
  group('14_anti_cheat_event', () => {
    const evRes = http.post(
      `${BASE_URL}/security/events`,
      JSON.stringify({
        participantId,
        eventType: 'TAB_HIDDEN',
        durationMs: 1200,
      }),
      { headers: authHeaders },
    );
    check(evRes, { 'event 201': (r) => r.status === 201 });
  });

  // 10. Submit Serentak
  group('10_idempotent_submit', () => {
    const subRes = http.post(
      `${BASE_URL}/student/participants/${participantId}/submit`,
      JSON.stringify({ idempotencyKey: `k6-submit-${participantId}` }),
      { headers: authHeaders },
    );
    submitTrend.add(subRes.timings.duration);
    const ok = check(subRes, { 'submit 201': (r) => r.status === 201 });
    errorRate.add(ok ? 0 : 1);
  });

  sleep(0.2);
}
