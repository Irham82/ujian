'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { apiRequest } from '@/lib/api-client';

export default function DeviceCheckPage() {
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();
  const sessionId = params?.sessionId || '';
  const [checkResult, setCheckResult] = useState<any>(null);
  const [cameraConsent, setCameraConsent] = useState<boolean>(false);
  const [cameraAvailable, setCameraAvailable] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const runDeviceCheck = async (consentValue = cameraConsent) => {
    setLoading(true);
    setError(null);
    try {
      const idbSupported = typeof window !== 'undefined' && 'indexedDB' in window;
      let hasCam = false;
      if (typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          hasCam = devices.some((d) => d.kind === 'videoinput');
        } catch {
          hasCam = false;
        }
      }
      setCameraAvailable(hasCam);

      const res = await apiRequest(`/student/exams/${sessionId}/device-check`, {
        method: 'POST',
        body: {
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
          indexedDbSupported: idbSupported,
          cameraAvailable: hasCam,
          cameraConsentGiven: consentValue,
          screenWidth: typeof window !== 'undefined' ? window.innerWidth : 1280,
          screenHeight: typeof window !== 'undefined' ? window.innerHeight : 720,
        },
      });
      setCheckResult(res);
    } catch (err: any) {
      setError(err.message || 'Gagal memeriksa kompatibilitas perangkat');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sessionId) {
      runDeviceCheck(false);
    }
  }, [sessionId]);

  return (
    <AppShell
      title="Pemeriksaan Kompatibilitas Perangkat & Kebijakan Ujian"
      subtitle="Memastikan browser, penyimpanan buffer offline IndexedDB, kebijakan Safe Exam Browser, dan persetujuan kamera opsional"
    >
      <div className="space-y-6">
        {error && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm font-semibold">
            {error}
          </div>
        )}

        {loading ? (
          <div className="bg-white p-6 rounded-xl border border-slate-200 text-sm text-slate-600">
            Menjalankan diagnostik perangkat dan memverifikasi kebijakan sesi ke server...
          </div>
        ) : checkResult ? (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
              <h2 className="text-base font-bold text-slate-900">
                1. Hasil Diagnostik Perangkat & Browser (BYOD)
              </h2>
              <div className="grid sm:grid-cols-2 gap-4 text-sm">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-xs font-bold uppercase text-slate-500">Platform Sistem Operasi</div>
                  <div className="font-bold text-slate-900 mt-1">{checkResult.osPlatform}</div>
                  <div className="text-xs text-slate-600 mt-1">
                    Dukungan Resmi Safe Exam Browser (SEB) di OS ini:{' '}
                    <strong>{checkResult.sebSupportedOnPlatform ? 'Didukung' : 'Tidak Didukung (Android BYOD)'}</strong>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-xs font-bold uppercase text-slate-500">
                    Kebijakan Browser Ujian ({checkResult.browserPolicy})
                  </div>
                  <div
                    className={`font-bold mt-1 ${
                      checkResult.browserPolicyMet ? 'text-emerald-700' : 'text-red-700'
                    }`}
                  >
                    {checkResult.browserPolicyMet
                      ? 'Memenuhi Kebijakan Browser'
                      : 'Belum Memenuhi Syarat Safe Exam Browser'}
                  </div>
                  {checkResult.hasProctorSebOverride && (
                    <div className="text-xs text-blue-700 font-semibold mt-1">
                      Pengecualian Resmi Proktor Aktif & Tercatat di Audit Log
                    </div>
                  )}
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-xs font-bold uppercase text-slate-500">
                    Buffer Lokal Mode Offline Terbatas (IndexedDB)
                  </div>
                  <div className="font-bold text-emerald-700 mt-1">
                    {checkResult.offlinePolicy?.indexedDbSupported
                      ? 'Aktif & Siap Menyimpan Buffer Lokal'
                      : 'Tidak Tersedia'}
                  </div>
                  <div className="text-xs text-slate-600 mt-1">
                    Toleransi Offline (Grace Period):{' '}
                    <strong>{checkResult.offlinePolicy?.offlineGracePeriodSeconds} detik</strong>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-xs font-bold uppercase text-slate-500">
                    Status Kebijakan Kamera Opsional
                  </div>
                  <div className="font-bold text-slate-900 mt-1">
                    {checkResult.cameraPolicy?.cameraEnabled
                      ? 'Kamera Opsional Diaktifkan Sekolah'
                      : 'Kamera Nonaktif (Tidak Digunakan pada Ujian Ini)'}
                  </div>
                  <div className="text-xs text-slate-600 mt-1">
                    Deteksi Kamera Perangkat: {cameraAvailable ? 'Tersedia' : 'Tidak Terdeteksi'}
                  </div>
                </div>
              </div>

              {checkResult.standardBrowserLimitationNotice && (
                <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                  <strong>Catatan Transparansi Keamanan:</strong>{' '}
                  {checkResult.standardBrowserLimitationNotice}
                </div>
              )}
            </div>

            {/* Bagian Kamera Opsional & Consent jika diaktifkan */}
            {checkResult.cameraPolicy?.cameraEnabled && (
              <div className="bg-white rounded-xl border border-blue-200 shadow-sm p-6 space-y-3">
                <h2 className="text-base font-bold text-blue-900">
                  2. Pemberitahuan Privasi & Persetujuan Kamera Opsional
                </h2>
                <ul className="text-xs text-slate-700 space-y-1 list-disc pl-5">
                  <li>
                    <strong>Tujuan:</strong> {checkResult.cameraPolicy.purpose}
                  </li>
                  <li>
                    <strong>Data yang Dikumpulkan:</strong> Snapshot berkala beresolusi rendah tanpa perekaman audio dan tanpa streaming video terus-menerus.
                  </li>
                  <li>
                    <strong>Pihak Berwenang Mengakses:</strong>{' '}
                    {checkResult.cameraPolicy.authorizedAccessRoles?.join(', ')} (setiap akses tercatat di Audit Log).
                  </li>
                  <li>
                    <strong>Masa Retensi Data:</strong> {checkResult.cameraPolicy.retentionDays} hari.
                  </li>
                  <li>
                    <strong>Prosedur Alternatif:</strong> {checkResult.cameraPolicy.alternativeProcedure}
                  </li>
                </ul>

                <div className="pt-2 flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <input
                      type="checkbox"
                      checked={cameraConsent}
                      onChange={(e) => {
                        setCameraConsent(e.target.checked);
                        runDeviceCheck(e.target.checked);
                      }}
                      className="w-4 h-4 rounded border-slate-300"
                    />
                    Saya memahami pemberitahuan privasi di atas dan memberikan izin kamera selama ujian
                  </label>
                </div>
              </div>
            )}

            <div className="flex flex-wrap justify-between items-center gap-3">
              <Link
                href="/exam-schedules"
                className="px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-700 text-xs font-bold"
              >
                Kembali ke Jadwal
              </Link>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => runDeviceCheck(cameraConsent)}
                  className="px-4 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold"
                >
                  Ulangi Pemeriksaan
                </button>
                <button
                  type="button"
                  disabled={!checkResult.allowedToStart}
                  onClick={() => router.push(`/student/exams/${sessionId}/instructions`)}
                  className="px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 disabled:bg-slate-300 text-white text-xs font-bold"
                >
                  Lanjut ke Halaman Petunjuk & Tata Tertib
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
