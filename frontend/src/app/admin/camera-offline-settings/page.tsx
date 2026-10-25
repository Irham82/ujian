'use client';

import React, { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { apiRequest } from '@/lib/api-client';

export default function CameraOfflineSettingsPage() {
  const [policy, setPolicy] = useState({
    offlineEnabledByDefault: true,
    defaultOfflineGracePeriodSeconds: 120,
    maxOfflineUnsyncedAnswers: 100,
    maxOfflineBufferBytes: 5242880,
    cameraEnabledByDefault: false,
    cameraRetentionDays: 14,
    requireExplicitCameraConsent: true,
  });
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    apiRequest('/settings')
      .then((res) => {
        if (res?.offline_and_camera_policy) {
          setPolicy((prev) => ({ ...prev, ...res.offline_and_camera_policy }));
        }
      })
      .catch(() => {});
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/settings/offline_and_camera_policy', {
        method: 'PATCH',
        body: policy,
      });
      setMessage('Kebijakan Mode Offline Terbatas dan Kamera Opsional berhasil disimpan.');
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  return (
    <AppShell
      title="Pengaturan Kamera Opsional & Mode Offline Terbatas"
      subtitle="Konfigurasi offline grace period, batas ukuran buffer IndexedDB, kebijakan konflik, serta privasi dan retensi kamera opsional"
    >
      <div className="space-y-6">
        {message && (
          <div className="p-3.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-sm font-medium">
            {message}
          </div>
        )}

        <form
          onSubmit={handleSave}
          className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5"
        >
          <h2 className="text-base font-bold text-slate-900">
            1. Kebijakan Mode Offline Terbatas (Gangguan Koneksi Sementara)
          </h2>

          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Offline Grace Period Default (Detik)
              </label>
              <input
                type="number"
                value={policy.defaultOfflineGracePeriodSeconds}
                onChange={(e) =>
                  setPolicy({
                    ...policy,
                    defaultOfflineGracePeriodSeconds: Number(e.target.value),
                  })
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Batas Maksimum Jawaban Belum Tersinkronisasi
              </label>
              <input
                type="number"
                value={policy.maxOfflineUnsyncedAnswers}
                onChange={(e) =>
                  setPolicy({
                    ...policy,
                    maxOfflineUnsyncedAnswers: Number(e.target.value),
                  })
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Batas Ukuran Buffer Lokal (Bytes)
              </label>
              <input
                type="number"
                value={policy.maxOfflineBufferBytes}
                onChange={(e) =>
                  setPolicy({
                    ...policy,
                    maxOfflineBufferBytes: Number(e.target.value),
                  })
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>
          </div>

          <hr className="border-slate-200" />

          <h2 className="text-base font-bold text-slate-900">
            2. Kebijakan Kamera Opsional & Perlindungan Privasi Siswa
          </h2>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Masa Retensi Data Kamera Maksimum (Hari)
              </label>
              <input
                type="number"
                value={policy.cameraRetentionDays}
                onChange={(e) =>
                  setPolicy({ ...policy, cameraRetentionDays: Number(e.target.value) })
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>
            <div className="flex flex-col justify-center gap-2 pt-3 text-sm">
              <label className="flex items-center gap-2 font-semibold text-slate-800">
                <input
                  type="checkbox"
                  checked={policy.cameraEnabledByDefault}
                  onChange={(e) =>
                    setPolicy({ ...policy, cameraEnabledByDefault: e.target.checked })
                  }
                />
                Aktifkan Kamera Secara Default (Rekomendasi: Nonaktif / False)
              </label>
              <label className="flex items-center gap-2 font-semibold text-slate-800">
                <input
                  type="checkbox"
                  checked={policy.requireExplicitCameraConsent}
                  onChange={(e) =>
                    setPolicy({
                      ...policy,
                      requireExplicitCameraConsent: e.target.checked,
                    })
                  }
                />
                Wajibkan Pemberitahuan Privasi, Consent Eksplisit & Prosedur Alternatif
              </label>
            </div>
          </div>

          <button
            type="submit"
            className="px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-sm font-bold"
          >
            Simpan Pengaturan Kamera & Offline
          </button>
        </form>
      </div>
    </AppShell>
  );
}
