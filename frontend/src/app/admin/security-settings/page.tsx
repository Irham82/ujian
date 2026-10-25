'use client';

import React, { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { apiRequest } from '@/lib/api-client';

export default function SecuritySettingsPage() {
  const [policy, setPolicy] = useState({
    defaultBrowserPolicy: 'STANDARD_BROWSER',
    detectVisibilityChange: true,
    detectWindowBlur: true,
    maxTabSwitchWarnings: 3,
    enforceSingleActiveSession: true,
  });
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    apiRequest('/settings')
      .then((res) => {
        if (res?.security_policy) {
          setPolicy((prev) => ({ ...prev, ...res.security_policy }));
        }
      })
      .catch(() => {});
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/settings/security_policy', {
        method: 'PATCH',
        body: policy,
      });
      setMessage('Konfigurasi keamanan ujian dan kebijakan Safe Exam Browser berhasil disimpan.');
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  return (
    <AppShell
      title="Pengaturan Keamanan Ujian & Integrasi Safe Exam Browser"
      subtitle="Atur kebijakan penguncian browser, deteksi perpindahan fokus/tab, sesi tunggal, dan kompatibilitas perangkat"
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
            Kebijakan Global Secure Exam Mode Sekolah
          </h2>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Kebijakan Browser Default Ujian Baru
              </label>
              <select
                value={policy.defaultBrowserPolicy}
                onChange={(e) =>
                  setPolicy({ ...policy, defaultBrowserPolicy: e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              >
                <option value="STANDARD_BROWSER">STANDARD_BROWSER (Mendukung seluruh HP & Laptop BYOD)</option>
                <option value="SECURE_BROWSER_OPTIONAL">SECURE_BROWSER_OPTIONAL (SEB Opsional)</option>
                <option value="SECURE_BROWSER_REQUIRED">SECURE_BROWSER_REQUIRED (Wajib SEB di Windows/macOS/iOS)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Batas Peringatan Perpindahan Tab Sebelum Status REVIEW_REQUIRED
              </label>
              <input
                type="number"
                value={policy.maxTabSwitchWarnings}
                onChange={(e) =>
                  setPolicy({ ...policy, maxTabSwitchWarnings: Number(e.target.value) })
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>
          </div>

          <div className="space-y-2.5 text-sm text-slate-800">
            <label className="flex items-center gap-2.5 font-medium">
              <input
                type="checkbox"
                checked={policy.detectVisibilityChange}
                onChange={(e) =>
                  setPolicy({ ...policy, detectVisibilityChange: e.target.checked })
                }
              />
              Aktifkan deteksi perpindahan tab (`visibilitychange` → `TAB_HIDDEN` beserta durasi)
            </label>
            <label className="flex items-center gap-2.5 font-medium">
              <input
                type="checkbox"
                checked={policy.detectWindowBlur}
                onChange={(e) =>
                  setPolicy({ ...policy, detectWindowBlur: e.target.checked })
                }
              />
              Aktifkan deteksi kehilangan fokus jendela (`window blur` → `WINDOW_BLUR`)
            </label>
            <label className="flex items-center gap-2.5 font-medium">
              <input
                type="checkbox"
                checked={policy.enforceSingleActiveSession}
                onChange={(e) =>
                  setPolicy({ ...policy, enforceSingleActiveSession: e.target.checked })
                }
              />
              Tolak sesi ganda & cabut token sesi lama saat peserta login di perangkat baru (`SESSION_DUPLICATE`)
            </label>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1">
            <div className="font-bold text-slate-900">
              Matriks Dukungan Resmi Safe Exam Browser (SEB) yang Diverifikasi:
            </div>
            <p>
              • <strong>Windows 10/11 & macOS:</strong> Didukung penuh oleh SEB 3.x (verifikasi `X-SafeExamBrowser-ConfigKeyHash`).
            </p>
            <p>
              • <strong>iPhone / iPad (iOS):</strong> Didukung melalui aplikasi SEB iOS + Single App Mode / Guided Access.
            </p>
            <p>
              • <strong>HP Android:</strong> Tidak memiliki klien SEB resmi dari seb.dev. Jika ujian menggunakan `SECURE_BROWSER_REQUIRED` pada skenario BYOD Android, Proktor dapat memberikan pengecualian resmi yang tercatat di Audit Log.
            </p>
          </div>

          <button
            type="submit"
            className="px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-sm font-bold"
          >
            Simpan Pengaturan Keamanan
          </button>
        </form>
      </div>
    </AppShell>
  );
}
