'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import {
  apiRequest,
  CurrentUserSession,
  formatSchoolTime,
  getSavedAuth,
} from '@/lib/api-client';

export default function ExamSchedulesPage() {
  const [user, setUser] = useState<CurrentUserSession | null>(null);
  const [studentExams, setStudentExams] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = getSavedAuth();
    setUser(saved.user);
    const roles = saved.user?.roles || [];

    if (roles.includes('STUDENT')) {
      apiRequest('/student/exams')
        .then((res) => {
          setStudentExams(Array.isArray(res?.exams) ? res.exams : []);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    } else {
      apiRequest('/exam-sessions')
        .then((res) => {
          setSessions(Array.isArray(res) ? res : []);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  }, []);

  const isStudent = user?.roles?.includes('STUDENT');

  return (
    <AppShell
      title="Jadwal & Sesi Pelaksanaan Ujian"
      subtitle="Daftar jadwal sesi ujian, ruang pelaksanaan, kebijakan perangkat, dan akses pengerjaan"
    >
      <div className="space-y-6">
        {loading ? (
          <div className="bg-white p-6 rounded-xl border border-slate-200 text-sm text-slate-500">
            Memuat jadwal sesi ujian dari server...
          </div>
        ) : isStudent ? (
          <div className="space-y-4">
            {studentExams.length === 0 ? (
              <div className="bg-white p-6 rounded-xl border border-slate-200 text-sm text-slate-500">
                Belum ada jadwal ujian yang ditugaskan untuk kelas Anda.
              </div>
            ) : (
              studentExams.map((item) => (
                <div
                  key={item.participant_id}
                  className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded bg-blue-900 text-white text-xs font-bold">
                        {item.exam_code}
                      </span>
                      <span className="px-2.5 py-0.5 rounded bg-blue-100 text-blue-900 text-xs font-bold">
                        Status Sesi: {item.participant_status}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-semibold">
                        {item.browser_policy}
                      </span>
                    </div>
                    <h2 className="text-lg font-bold text-slate-900">{item.exam_title}</h2>
                    <p className="text-xs text-slate-600">
                      Mata Pelajaran: {item.subject_name} • Ruang: {item.room_name} • Durasi:{' '}
                      {item.duration_minutes} Menit
                    </p>
                    <p className="text-xs text-slate-500">
                      Jadwal Buka: {formatSchoolTime(item.scheduled_start_at, user?.schoolTimezone)}{' '}
                      s.d. {formatSchoolTime(item.scheduled_end_at, user?.schoolTimezone)}
                    </p>
                    {item.published_score !== null && item.published_score !== undefined && (
                      <div className="inline-block mt-1 px-3 py-1 rounded-lg bg-emerald-100 text-emerald-900 text-xs font-extrabold">
                        Nilai Akhir Terpublikasi: {item.published_score}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2.5 shrink-0">
                    <Link
                      href={`/student/exams/${item.session_id}/device-check`}
                      className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold"
                    >
                      1. Cek Perangkat
                    </Link>
                    <Link
                      href={`/student/exams/${item.session_id}/instructions`}
                      className="px-4 py-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-900 text-xs font-bold border border-blue-200"
                    >
                      2. Baca Petunjuk
                    </Link>
                    {item.participant_status !== 'SUBMITTED' && (
                      <Link
                        href={`/student/exams/${item.session_id}/take`}
                        className="px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold shadow-sm"
                      >
                        3. {item.participant_status === 'IN_PROGRESS' ? 'Lanjutkan Ujian' : 'Mulai Ujian'}
                      </Link>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-3">
            <h2 className="text-base font-bold text-slate-900">
              Jadwal Sesi Ruang Ujian (Admin / Proktor / Pengawas / Guru)
            </h2>
            {sessions.map((s) => (
              <div
                key={s.id}
                className="p-4 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-4"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded bg-blue-900 text-white text-xs font-bold">
                      Token Ruang: {s.access_token}
                    </span>
                    <span className="px-2.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-xs font-bold">
                      {s.status}
                    </span>
                  </div>
                  <h3 className="font-bold text-slate-900 mt-1">
                    {s.title} — {s.exam_title}
                  </h3>
                  <p className="text-xs text-slate-600">
                    Ruang: {s.room_name} ({s.room_code}) • Peserta Terdaftar:{' '}
                    {s.total_participants || 0} Siswa
                  </p>
                </div>

                <div className="flex gap-2">
                  <Link
                    href={`/proctor/dashboard?sessionId=${s.id}`}
                    className="px-3.5 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold"
                  >
                    Monitoring Proktor
                  </Link>
                  <Link
                    href={`/supervisor/dashboard?sessionId=${s.id}`}
                    className="px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold"
                  >
                    Panel Pengawas
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
