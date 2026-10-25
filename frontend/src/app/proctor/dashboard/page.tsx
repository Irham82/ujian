'use client';

import React, { useCallback, useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { apiRequest } from '@/lib/api-client';

export default function ProctorDashboardPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [summary, setSummary] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [message, setMessage] = useState<string | null>(null);
  const [incidentTitle, setIncidentTitle] = useState('');
  const [incidentDesc, setIncidentDesc] = useState('');

  const loadSessionData = useCallback(async (sessId: string, stFilter = statusFilter) => {
    if (!sessId) return;
    try {
      const q = stFilter ? `?status=${encodeURIComponent(stFilter)}` : '';
      const [sum, parts] = await Promise.all([
        apiRequest(`/monitoring/sessions/${sessId}/summary`),
        apiRequest(`/monitoring/sessions/${sessId}/participants${q}`),
      ]);
      setSummary(sum);
      setParticipants(Array.isArray(parts?.items) ? parts.items : []);
    } catch (err: any) {
      setMessage(err.message);
    }
  }, [statusFilter]);

  useEffect(() => {
    apiRequest('/exam-sessions')
      .then((res) => {
        const list = Array.isArray(res) ? res : [];
        setSessions(list);
        if (list.length > 0) {
          setSelectedSessionId(list[0].id);
          loadSessionData(list[0].id, '');
        }
      })
      .catch((err) => setMessage(err.message));
  }, [loadSessionData]);

  // Adaptive polling every 5 seconds
  useEffect(() => {
    if (!selectedSessionId) return;
    const timer = setInterval(() => {
      loadSessionData(selectedSessionId, statusFilter);
    }, 5000);
    return () => clearInterval(timer);
  }, [selectedSessionId, statusFilter, loadSessionData]);

  const sendWarning = async (participantId: string, studentName: string) => {
    try {
      await apiRequest(`/monitoring/participants/${participantId}/warning`, {
        method: 'POST',
        body: {
          message: `Peringatan Proktor: Harap fokus pada pengerjaan ujian dan tetap di tab ujian.`,
        },
      });
      setMessage(`Peringatan resmi dikirim kepada ${studentName} dan tercatat di Audit Log.`);
      await loadSessionData(selectedSessionId, statusFilter);
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  const runIntervention = async (
    participantId: string,
    actionType: string,
    reason: string,
    extraTimeSeconds?: number,
  ) => {
    try {
      await apiRequest(`/monitoring/participants/${participantId}/intervene`, {
        method: 'POST',
        body: { actionType, reason, extraTimeSeconds },
      });
      setMessage(`Tindakan pemulihan (${actionType}) berhasil diterapkan & tercatat di Audit Log.`);
      await loadSessionData(selectedSessionId, statusFilter);
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  const handleEscalateIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSessionId) return;
    try {
      await apiRequest(`/monitoring/sessions/${selectedSessionId}/incidents`, {
        method: 'POST',
        body: {
          category: 'TECHNICAL_OR_SECURITY_INCIDENT',
          severity: 'HIGH',
          title: incidentTitle,
          description: incidentDesc,
          escalateToAdmin: true,
        },
      });
      setIncidentTitle('');
      setIncidentDesc('');
      setMessage('Insiden berhasil dicatat dan dieskalasi kepada Administrator.');
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  const m = summary?.metrics || {};

  return (
    <AppShell
      title="Dashboard Monitoring Proktor Real-Time"
      subtitle="Pantau kesiapan ruang, status pengerjaan, koneksi offline, sinkronisasi jawaban, peringatan, dan pemulihan sesi"
    >
      <div className="space-y-6">
        {message && (
          <div className="p-3.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-sm font-medium">
            {message}
          </div>
        )}

        {/* Pilihan Sesi & Filter Status */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs font-bold uppercase text-slate-500">Sesi Ujian:</label>
            <select
              value={selectedSessionId}
              onChange={(e) => {
                setSelectedSessionId(e.target.value);
                loadSessionData(e.target.value, statusFilter);
              }}
              className="px-3 py-2 rounded-lg border border-slate-300 text-sm font-semibold"
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} ({s.room_name})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-bold uppercase text-slate-500">Filter Status:</label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                loadSessionData(selectedSessionId, e.target.value);
              }}
              className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
            >
              <option value="">Semua Peserta</option>
              <option value="READY">Belum Mulai (READY)</option>
              <option value="IN_PROGRESS">Sedang Mengerjakan (IN_PROGRESS)</option>
              <option value="PAUSED">Dijeda (PAUSED)</option>
              <option value="SUBMITTED">Sudah Selesai (SUBMITTED)</option>
              <option value="EXPIRED">Waktu Habis (EXPIRED)</option>
            </select>
          </div>
        </div>

        {/* 10 Indikator Wajib Dashboard Proktor (Section 14) */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="bg-white p-4 rounded-xl border border-slate-200">
            <div className="text-xs font-bold text-slate-500">1. Total Peserta</div>
            <div className="text-2xl font-extrabold text-slate-900 mt-1">
              {m.totalParticipants ?? 0}
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200">
            <div className="text-xs font-bold text-slate-500">2. Belum Mulai</div>
            <div className="text-2xl font-extrabold text-slate-700 mt-1">{m.notStarted ?? 0}</div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-blue-200 bg-blue-50/40">
            <div className="text-xs font-bold text-blue-800">3. Sedang Mengerjakan</div>
            <div className="text-2xl font-extrabold text-blue-900 mt-1">{m.inProgress ?? 0}</div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/40">
            <div className="text-xs font-bold text-emerald-800">4. Sudah Selesai</div>
            <div className="text-2xl font-extrabold text-emerald-900 mt-1">{m.completed ?? 0}</div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200">
            <div className="text-xs font-bold text-slate-500">5. Terputus</div>
            <div className="text-2xl font-extrabold text-amber-700 mt-1">{m.disconnected ?? 0}</div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-amber-200 bg-amber-50/40">
            <div className="text-xs font-bold text-amber-800">6. Offline dlm Toleransi</div>
            <div className="text-2xl font-extrabold text-amber-900 mt-1">
              {m.offlineWithinGrace ?? 0}
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-red-200 bg-red-50/40">
            <div className="text-xs font-bold text-red-800">7. Lewat Batas Offline</div>
            <div className="text-2xl font-extrabold text-red-900 mt-1">
              {m.offlineExceededGrace ?? 0}
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200">
            <div className="text-xs font-bold text-slate-500">8. Menunggu Sinkronisasi</div>
            <div className="text-2xl font-extrabold text-sky-700 mt-1">
              {m.unsyncedAnswersTotal ?? 0}
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200">
            <div className="text-xs font-bold text-slate-500">9. Kejadian Keamanan</div>
            <div className="text-2xl font-extrabold text-slate-900 mt-1">
              {m.securityEventsTotal ?? 0}
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-red-200">
            <div className="text-xs font-bold text-red-700">10. Perlu Peninjauan</div>
            <div className="text-2xl font-extrabold text-red-700 mt-1">
              {m.sessionsNeedingReview ?? 0}
            </div>
          </div>
        </div>

        {/* Tabel Peserta & Kendali Pemulihan Sesi */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-base font-bold text-slate-900 mb-4">
            Daftar Peserta Sesi & Tindakan Proktor Terotorisasi
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-600 uppercase text-xs border-b">
                <tr>
                  <th className="py-3 px-3">Nama Peserta</th>
                  <th className="py-3 px-3">Kelas</th>
                  <th className="py-3 px-3">Status Sesi</th>
                  <th className="py-3 px-3">Koneksi & Buffer</th>
                  <th className="py-3 px-3">Terjawab</th>
                  <th className="py-3 px-3">Event</th>
                  <th className="py-3 px-3">Tindakan Pemulihan & Peringatan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {participants.map((p) => (
                  <tr key={p.participant_id}>
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-900">{p.student_name}</div>
                      <div className="text-xs text-slate-500">{p.identifier_code}</div>
                    </td>
                    <td className="py-3 px-3 text-xs font-semibold">{p.class_name}</td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-900 text-xs font-bold">
                        {p.status}
                      </span>
                      {p.needs_review && (
                        <span className="ml-1 px-2 py-0.5 rounded bg-red-100 text-red-800 text-xs font-bold">
                          TINJAU
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-xs">
                      <div className="font-semibold">{p.connection_status}</div>
                      <div className="text-slate-500">
                        Unsynced: {p.unsynced_answers_count || 0}
                      </div>
                    </td>
                    <td className="py-3 px-3 font-bold">{p.answered_count || 0} Soal</td>
                    <td className="py-3 px-3 font-bold text-amber-800">
                      {p.security_events_count || 0}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => sendWarning(p.participant_id, p.student_name)}
                          className="px-2.5 py-1 rounded bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-bold"
                        >
                          Peringatan
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            runIntervention(
                              p.participant_id,
                              'RESUME_SESSION',
                              'Pemulihan sesi setelah pergantian perangkat / gangguan jaringan',
                            )
                          }
                          className="px-2.5 py-1 rounded bg-blue-100 hover:bg-blue-200 text-blue-900 text-xs font-bold"
                        >
                          Pulihkan Sesi
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            runIntervention(
                              p.participant_id,
                              'ADD_EXTRA_TIME',
                              'Kompensasi waktu gangguan teknis ruang ujian (5 menit)',
                              300,
                            )
                          }
                          className="px-2.5 py-1 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-900 text-xs font-bold"
                        >
                          +5m Waktu
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            runIntervention(
                              p.participant_id,
                              'APPROVE_SEB_EXCEPTION',
                              'Pengecualian resmi SEB untuk perangkat Android BYOD terverifikasi',
                            )
                          }
                          className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold"
                        >
                          Izin SEB BYOD
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Form Pencatatan Gangguan Teknis & Eskalasi ke Admin */}
        <form
          onSubmit={handleEscalateIncident}
          className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4"
        >
          <h2 className="text-base font-bold text-slate-900">
            Catat Gangguan Teknis & Eskalasi Insiden ke Administrator
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <input
              type="text"
              required
              value={incidentTitle}
              onChange={(e) => setIncidentTitle(e.target.value)}
              placeholder="Judul gangguan teknis / insiden ruang"
              className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
            />
            <input
              type="text"
              required
              value={incidentDesc}
              onChange={(e) => setIncidentDesc(e.target.value)}
              placeholder="Kronologi & tindakan awal yang telah diambil proktor"
              className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
            />
          </div>
          <button
            type="submit"
            className="px-5 py-2.5 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-bold"
          >
            Catat & Eskalasi Insiden ke Admin
          </button>
        </form>
      </div>
    </AppShell>
  );
}
