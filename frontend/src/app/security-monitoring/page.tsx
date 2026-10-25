'use client';

import React, { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { apiRequest, formatSchoolTime } from '@/lib/api-client';

export default function SecurityMonitoringPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [classificationFilter, setClassificationFilter] = useState<string>('');
  const [events, setEvents] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadEvents = async (sessId: string, clsFilter = classificationFilter) => {
    if (!sessId) return;
    try {
      const q = clsFilter ? `?classification=${encodeURIComponent(clsFilter)}` : '';
      const res = await apiRequest(`/monitoring/sessions/${sessId}/events${q}`);
      setEvents(Array.isArray(res?.items) ? res.items : []);
    } catch (err: any) {
      setError(err.message);
    }
  };

  useEffect(() => {
    apiRequest('/exam-sessions')
      .then((res) => {
        const list = Array.isArray(res) ? res : [];
        setSessions(list);
        if (list.length > 0) {
          setSelectedSessionId(list[0].id);
          loadEvents(list[0].id, '');
        }
      })
      .catch((err) => setError(err.message));
  }, []);

  const badgeForClassification = (c: string) => {
    if (c === 'SECURITY_INCIDENT') return 'bg-red-700 text-white';
    if (c === 'REVIEW_REQUIRED') return 'bg-red-100 text-red-900 border border-red-300';
    if (c === 'ATTENTION') return 'bg-amber-100 text-amber-900 border border-amber-300';
    return 'bg-slate-100 text-slate-700';
  };

  return (
    <AppShell
      title="Monitoring Kejadian Keamanan & Anti-Kecurangan"
      subtitle="Pemantauan 16 jenis event keamanan dengan 4 tingkat klasifikasi proporsional (tanpa sanksi tuduhan otomatis)"
    >
      <div className="space-y-6">
        {error && (
          <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
            {error}
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold uppercase text-slate-500">Sesi Ujian:</label>
            <select
              value={selectedSessionId}
              onChange={(e) => {
                setSelectedSessionId(e.target.value);
                loadEvents(e.target.value, classificationFilter);
              }}
              className="px-3 py-2 rounded-lg border border-slate-300 text-sm font-semibold"
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-bold uppercase text-slate-500">Klasifikasi:</label>
            <select
              value={classificationFilter}
              onChange={(e) => {
                setClassificationFilter(e.target.value);
                loadEvents(selectedSessionId, e.target.value);
              }}
              className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
            >
              <option value="">Semua Klasifikasi (4 Level)</option>
              <option value="INFORMATION">INFORMATION</option>
              <option value="ATTENTION">ATTENTION</option>
              <option value="REVIEW_REQUIRED">REVIEW_REQUIRED</option>
              <option value="SECURITY_INCIDENT">SECURITY_INCIDENT</option>
            </select>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-3">
          <h2 className="text-base font-bold text-slate-900">
            Riwayat Kejadian Keamanan Terverifikasi Server
          </h2>
          {events.length === 0 ? (
            <p className="text-sm text-slate-500">
              Belum ada kejadian keamanan yang tercatat pada filter ini.
            </p>
          ) : (
            <div className="space-y-2.5">
              {events.map((ev) => (
                <div
                  key={ev.id}
                  className="p-4 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2.5 py-0.5 rounded text-xs font-bold ${badgeForClassification(
                          ev.classification,
                        )}`}
                      >
                        {ev.classification}
                      </span>
                      <span className="font-mono font-bold text-sm text-slate-900">
                        {ev.event_type}
                      </span>
                      {ev.duration_ms && (
                        <span className="text-xs text-slate-500">
                          (Durasi: {Math.round(ev.duration_ms / 100) / 10}s)
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-700">
                      Peserta: <strong>{ev.student_name}</strong> ({ev.identifier_code || '-'})
                    </div>
                    {ev.review_notes && (
                      <div className="text-xs text-blue-800 font-medium">
                        Catatan Proktor: {ev.review_notes}
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">
                    {formatSchoolTime(ev.recorded_at)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
