'use client';

import React, { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { apiRequest } from '@/lib/api-client';

export default function SupervisorDashboardPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [participants, setParticipants] = useState<any[]>([]);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [reportTitle, setReportTitle] = useState('');
  const [reportDesc, setReportDesc] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const loadRoomData = async (sessId: string) => {
    if (!sessId) return;
    try {
      const [parts, incs] = await Promise.all([
        apiRequest(`/monitoring/sessions/${sessId}/participants`),
        apiRequest(`/monitoring/sessions/${sessId}/incidents`),
      ]);
      setParticipants(Array.isArray(parts?.items) ? parts.items : []);
      setIncidents(Array.isArray(incs) ? incs : []);
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  useEffect(() => {
    apiRequest('/exam-sessions')
      .then((res) => {
        const list = Array.isArray(res) ? res : [];
        setSessions(list);
        if (list.length > 0) {
          setSelectedSessionId(list[0].id);
          loadRoomData(list[0].id);
        }
      })
      .catch((err) => setMessage(err.message));
  }, []);

  const markAttendance = async (
    participantId: string,
    status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED',
  ) => {
    try {
      await apiRequest(`/monitoring/participants/${participantId}/attendance`, {
        method: 'POST',
        body: { status, notes: `Dicatat oleh Pengawas Ruang (${status})` },
      });
      setMessage(`Kehadiran peserta diperbarui menjadi ${status}.`);
      await loadRoomData(selectedSessionId);
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  const handleSendReportToProctor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSessionId) return;
    try {
      await apiRequest(`/monitoring/sessions/${selectedSessionId}/incidents`, {
        method: 'POST',
        body: {
          category: 'SUPERVISOR_ROOM_NOTE',
          severity: 'MEDIUM',
          title: reportTitle,
          description: reportDesc,
        },
      });
      setReportTitle('');
      setReportDesc('');
      setMessage('Laporan kejadian dan keterangan ruang berhasil dikirim kepada Proktor.');
      await loadRoomData(selectedSessionId);
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  return (
    <AppShell
      title="Dashboard Pengawas Ruang Ujian"
      subtitle="Catat kehadiran peserta, pantau status pengerjaan ruang yang menjadi tanggung jawab Anda, dan kirim berita acara kepada Proktor"
    >
      <div className="space-y-6">
        <div className="p-3.5 rounded-xl bg-slate-100 border border-slate-300 text-xs text-slate-700">
          <strong>Batasan Hak Akses Pengawas (Least Privilege):</strong> Sesuai kebijakan keamanan, Pengawas hanya melihat peserta pada ruang penugasannya dan tidak memiliki akses ke kunci jawaban, perubahan soal, perubahan nilai, maupun penghapusan audit log.
        </div>

        {message && (
          <div className="p-3.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-sm font-medium">
            {message}
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-base font-bold text-slate-900">
              Presensi & Status Peserta Ruang Tugas
            </h2>
            <select
              value={selectedSessionId}
              onChange={(e) => {
                setSelectedSessionId(e.target.value);
                loadRoomData(e.target.value);
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

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-600 uppercase text-xs border-b">
                <tr>
                  <th className="py-3 px-3">Peserta</th>
                  <th className="py-3 px-3">Kelas</th>
                  <th className="py-3 px-3">Status Pengerjaan</th>
                  <th className="py-3 px-3">Status Kehadiran</th>
                  <th className="py-3 px-3">Catat Presensi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {participants.map((p) => (
                  <tr key={p.participant_id}>
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-900">{p.student_name}</div>
                      <div className="text-xs text-slate-500">{p.identifier_code}</div>
                    </td>
                    <td className="py-3 px-3 text-xs">{p.class_name}</td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-900 text-xs font-bold">
                        {p.status}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 text-xs font-bold">
                        {p.attendance_status || 'BELUM DICATAT'}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex flex-wrap gap-1.5">
                        {(['PRESENT', 'LATE', 'ABSENT', 'EXCUSED'] as const).map((st) => (
                          <button
                            key={st}
                            type="button"
                            onClick={() => markAttendance(p.participant_id, st)}
                            className="px-2.5 py-1 rounded border border-slate-300 hover:bg-slate-100 text-xs font-semibold"
                          >
                            {st}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <form
          onSubmit={handleSendReportToProctor}
          className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4"
        >
          <h2 className="text-base font-bold text-slate-900">
            Tambah Catatan Kejadian Ruang & Kirim Laporan kepada Proktor
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <input
              type="text"
              required
              value={reportTitle}
              onChange={(e) => setReportTitle(e.target.value)}
              placeholder="Ringkasan kejadian / keterangan ruang ujian"
              className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
            />
            <input
              type="text"
              required
              value={reportDesc}
              onChange={(e) => setReportDesc(e.target.value)}
              placeholder="Detail keterangan pengawas ruang..."
              className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
            />
          </div>
          <button
            type="submit"
            className="px-5 py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold"
          >
            Kirim Laporan ke Proktor
          </button>

          {incidents.length > 0 && (
            <div className="pt-4 border-t border-slate-200 space-y-2">
              <div className="text-xs font-bold uppercase text-slate-500">
                Riwayat Berita Acara Sesi Ini:
              </div>
              {incidents.map((inc) => (
                <div key={inc.id} className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                  <div className="font-bold text-slate-900">
                    [{inc.status}] {inc.title} — Pelapor: {inc.reporter_name}
                  </div>
                  <div className="text-slate-600 mt-0.5">{inc.description}</div>
                </div>
              ))}
            </div>
          )}
        </form>
      </div>
    </AppShell>
  );
}
