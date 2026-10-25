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

export default function DashboardPage() {
  const [user, setUser] = useState<CurrentUserSession | null>(null);
  const [health, setHealth] = useState<any>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = getSavedAuth();
    setUser(saved.user);
    Promise.all([
      apiRequest('/health').catch(() => null),
      apiRequest('/notifications').catch(() => []),
    ]).then(([h, notif]) => {
      setHealth(h);
      setNotifications(Array.isArray(notif) ? notif : []);
      setLoading(false);
    });
  }, []);

  const primaryRole = user?.roles?.[0] || 'STUDENT';

  return (
    <AppShell
      title={`Dashboard Operasional — Role: ${primaryRole}`}
      subtitle="Pusat kendali dan ringkasan kewenangan sesuai matriks Role-Based Access Control (RBAC)"
    >
      <div className="space-y-6">
        {/* Status Infrastruktur & Waktu Server */}
        <div className="grid sm:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div className="text-xs font-bold uppercase text-slate-500">Status Mesin Ujian</div>
            <div className="mt-1 text-lg font-extrabold text-emerald-700">
              {health?.status || 'ONLINE (READY)'}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Driver DB: {health?.database?.driver || 'PostgreSQL 16'} ({health?.database?.tableCount || 31} Tabel)
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div className="text-xs font-bold uppercase text-slate-500">Waktu Kebenaran Server</div>
            <div className="mt-1 text-base font-bold text-slate-900">
              {health?.serverTimeUtc
                ? formatSchoolTime(health.serverTimeUtc, user?.schoolTimezone || 'Asia/Makassar')
                : 'Tersinkronisasi UTC'}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Zona Waktu Sekolah: {user?.schoolTimezone || 'Asia/Makassar'}
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div className="text-xs font-bold uppercase text-slate-500">Identitas Sesi Aktif</div>
            <div className="mt-1 text-base font-bold text-blue-900">
              {user?.fullName || 'Tamu / Belum Login'}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Kewenangan: {user?.roles?.join(', ') || 'Silakan login'}
            </div>
          </div>
        </div>

        {/* Kartu Aksi Spesifik Role */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-base font-bold text-slate-900 mb-4">
            Modul Kewenangan Role ({primaryRole})
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Link
              href="/exam-schedules"
              className="p-4 rounded-xl border border-blue-200 bg-blue-50/60 hover:bg-blue-100/70 transition"
            >
              <div className="font-bold text-blue-900">Jadwal & Sesi Ujian</div>
              <p className="text-xs text-slate-600 mt-1">
                Lihat sesi ujian aktif, pemeriksaan perangkat, petunjuk, dan mulai pengerjaan.
              </p>
            </Link>

            <Link
              href="/question-banks"
              className="p-4 rounded-xl border border-slate-200 hover:border-blue-400 transition"
            >
              <div className="font-bold text-slate-900">Bank Soal & Editor 5 Tipe</div>
              <p className="text-xs text-slate-600 mt-1">
                Kelola PG, PG Kompleks, Benar-Salah, Isian Singkat, dan Esai beserta versioning.
              </p>
            </Link>

            <Link
              href="/proctor/dashboard"
              className="p-4 rounded-xl border border-slate-200 hover:border-blue-400 transition"
            >
              <div className="font-bold text-slate-900">Dashboard Proktor Real-Time</div>
              <p className="text-xs text-slate-600 mt-1">
                Pantau peserta online/offline, antrean sinkronisasi, peringatan, dan pemulihan sesi.
              </p>
            </Link>

            <Link
              href="/supervisor/dashboard"
              className="p-4 rounded-xl border border-slate-200 hover:border-blue-400 transition"
            >
              <div className="font-bold text-slate-900">Dashboard Pengawas Ruang</div>
              <p className="text-xs text-slate-600 mt-1">
                Catat kehadiran peserta, pantau status pengerjaan ruang, dan lapor insiden ke proktor.
              </p>
            </Link>

            <Link
              href="/results-analytics"
              className="p-4 rounded-xl border border-slate-200 hover:border-blue-400 transition"
            >
              <div className="font-bold text-slate-900">Penilaian & Analisis Butir Soal</div>
              <p className="text-xs text-slate-600 mt-1">
                Koreksi manual esai, lihat indeks kesukaran soal, dan unduh laporan CSV.
              </p>
            </Link>

            <Link
              href="/admin/audit-logs"
              className="p-4 rounded-xl border border-slate-200 hover:border-blue-400 transition"
            >
              <div className="font-bold text-slate-900">Audit Log & Backup Terenkripsi</div>
              <p className="text-xs text-slate-600 mt-1">
                Jejak audit tindakan sensitif serta pencadangan & pemulihan database AES-256-GCM.
              </p>
            </Link>
          </div>
        </div>

        {/* Pengumuman & Notifikasi */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-base font-bold text-slate-900 mb-3">
            Pengumuman & Notifikasi Sistem
          </h2>
          {loading ? (
            <div className="text-sm text-slate-500">Memuat pengumuman...</div>
          ) : notifications.length === 0 ? (
            <div className="text-sm text-slate-500">
              Tidak ada pengumuman atau peringatan baru saat ini.
            </div>
          ) : (
            <div className="space-y-2">
              {notifications.map((n: any) => (
                <div
                  key={n.id}
                  className="p-3.5 rounded-lg bg-slate-50 border border-slate-200"
                >
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-sm text-slate-900">{n.title}</span>
                    <span className="text-xs text-slate-500">
                      {formatSchoolTime(n.created_at)}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700 mt-1">{n.body}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
