'use client';

import React, { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { apiRequest, formatSchoolTime } from '@/lib/api-client';

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const res = await apiRequest('/audit-logs?limit=150');
      setLogs(Array.isArray(res) ? res : []);
    } catch (err: any) {
      setBackupMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const handleEncryptedBackup = async () => {
    try {
      const res = await apiRequest('/admin/backup', { method: 'POST' });
      const blob = new Blob([res.encryptedPayload], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cbt-pro-encrypted-backup-${Date.now()}.sql.enc`;
      a.click();
      URL.revokeObjectURL(url);
      setBackupMessage(
        'Backup database terenkripsi (AES-256-GCM) berhasil dibuat dan diunduh. Jejak backup tercatat di Audit Log.',
      );
      await loadLogs();
    } catch (err: any) {
      setBackupMessage(err.message);
    }
  };

  return (
    <AppShell
      title="Audit Log Sistem & Pencadangan Terenkripsi"
      subtitle="Jejak audit imutabel untuk seluruh tindakan kritis (login, perubahan versi soal, intervensi proktor, akses kamera, backup)"
    >
      <div className="space-y-6">
        {backupMessage && (
          <div className="p-3.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-sm font-medium">
            {backupMessage}
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Pencadangan Database Terenkripsi (AES-256-GCM)
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Seluruh 31 tabel diekspor dan dienkripsi menggunakan kunci server tanpa menulis password atau secret ke log.
            </p>
          </div>
          <button
            type="button"
            onClick={handleEncryptedBackup}
            className="px-4 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold"
          >
            Buat & Unduh Backup Terenkripsi
          </button>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-base font-bold text-slate-900 mb-4">
            Jejak Audit Aktivitas Sistem (Tidak Dapat Dihapus Pengawas/Siswa)
          </h2>
          {loading ? (
            <div className="text-sm text-slate-500">Memuat audit log...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-600 uppercase text-xs border-b">
                  <tr>
                    <th className="py-3 px-3">Waktu (Sekolah)</th>
                    <th className="py-3 px-3">Pelaku (Actor)</th>
                    <th className="py-3 px-3">Role</th>
                    <th className="py-3 px-3">Aksi</th>
                    <th className="py-3 px-3">Target</th>
                    <th className="py-3 px-3">Metadata (Teredaksi)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {logs.map((l) => (
                    <tr key={l.id}>
                      <td className="py-2.5 px-3 text-xs text-slate-500 whitespace-nowrap">
                        {formatSchoolTime(l.created_at)}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900">
                        {l.actor_name || l.actor_username || 'SYSTEM'}
                      </td>
                      <td className="py-2.5 px-3 text-xs font-bold text-blue-800">
                        {l.actor_role}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-xs font-bold text-slate-900">
                        {l.action}
                      </td>
                      <td className="py-2.5 px-3 text-xs text-slate-600">
                        {l.target_type}: {l.target_id}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-xs text-slate-600 max-w-xs truncate">
                        {JSON.stringify(l.metadata)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
