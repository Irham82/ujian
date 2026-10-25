'use client';

import React, { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { apiRequest } from '@/lib/api-client';

export default function ExamsPage() {
  const [exams, setExams] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [years, setYears] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [banks, setBanks] = useState<any[]>([]);
  const [bankQuestions, setBankQuestions] = useState<any[]>([]);
  const [selectedBankId, setSelectedBankId] = useState('');
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [form, setForm] = useState({
    subjectId: '',
    academicYearId: '',
    title: '',
    code: '',
    durationMinutes: 90,
    randomizeQuestions: true,
    randomizeOptions: true,
    browserPolicy: 'STANDARD_BROWSER',
    cameraEnabled: false,
    offlineEnabled: true,
    offlineGracePeriodSeconds: 120,
    publishResults: true,
  });
  const [message, setMessage] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const [ex, sub, yr, cls, bks] = await Promise.all([
        apiRequest('/exams'),
        apiRequest('/academic/subjects'),
        apiRequest('/academic/years'),
        apiRequest('/academic/classes'),
        apiRequest('/question-banks'),
      ]);
      setExams(Array.isArray(ex) ? ex : []);
      setSubjects(Array.isArray(sub) ? sub : []);
      setYears(Array.isArray(yr) ? yr : []);
      setClasses(Array.isArray(cls) ? cls : []);
      setBanks(Array.isArray(bks) ? bks : []);
      if (Array.isArray(sub) && sub.length > 0 && !form.subjectId) {
        setForm((prev) => ({ ...prev, subjectId: sub[0].id }));
      }
      if (Array.isArray(yr) && yr.length > 0 && !form.academicYearId) {
        setForm((prev) => ({ ...prev, academicYearId: yr[0].id }));
      }
      if (Array.isArray(bks) && bks.length > 0 && !selectedBankId) {
        setSelectedBankId(bks[0].id);
        const qs = await apiRequest(`/question-banks/${bks[0].id}/questions`);
        setBankQuestions(Array.isArray(qs) ? qs : []);
        setSelectedQuestionIds(Array.isArray(qs) ? qs.map((q: any) => q.id) : []);
      }
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/exams', {
        method: 'POST',
        body: {
          ...form,
          questionIds: selectedQuestionIds,
          classIds: selectedClassIds,
        },
      });
      setMessage('Paket ujian baru berhasil dibuat dengan snapshot versi soal terkunci.');
      setForm((prev) => ({ ...prev, title: '', code: '' }));
      await loadData();
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  const changeStatus = async (examId: string, status: string) => {
    try {
      await apiRequest(`/exams/${examId}/status`, {
        method: 'POST',
        body: { status },
      });
      setMessage(`Status paket ujian diperbarui ke ${status}.`);
      await loadData();
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  return (
    <AppShell
      title="Manajemen Paket Ujian & State Machine"
      subtitle="Atur paket soal, pengacakan soal/opsi, kebijakan Safe Exam Browser, kamera opsional, dan toleransi offline"
    >
      <div className="space-y-6">
        {message && (
          <div className="p-3.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-sm font-medium">
            {message}
          </div>
        )}

        <form
          onSubmit={handleCreateExam}
          className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4"
        >
          <h2 className="text-base font-bold text-slate-900">Buat Paket Ujian Baru</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Judul Ujian</label>
              <input
                type="text"
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                placeholder="Ujian TKA Matematika Utama"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Kode Paket</label>
              <input
                type="text"
                required
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                placeholder="TKA-MTK-2026-02"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Durasi (Menit)</label>
              <input
                type="number"
                required
                value={form.durationMinutes}
                onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Kebijakan Penguncian Browser
              </label>
              <select
                value={form.browserPolicy}
                onChange={(e) => setForm({ ...form, browserPolicy: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              >
                <option value="STANDARD_BROWSER">STANDARD_BROWSER (BYOD Umum)</option>
                <option value="SECURE_BROWSER_OPTIONAL">SECURE_BROWSER_OPTIONAL</option>
                <option value="SECURE_BROWSER_REQUIRED">SECURE_BROWSER_REQUIRED (SEB Wajib)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Offline Grace Period (Detik)
              </label>
              <input
                type="number"
                value={form.offlineGracePeriodSeconds}
                onChange={(e) =>
                  setForm({ ...form, offlineGracePeriodSeconds: Number(e.target.value) })
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>
            <div className="flex flex-col justify-center gap-1.5 pt-4">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                <input
                  type="checkbox"
                  checked={form.randomizeQuestions}
                  onChange={(e) => setForm({ ...form, randomizeQuestions: e.target.checked })}
                />
                Acak Urutan Soal & Opsi per Peserta
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                <input
                  type="checkbox"
                  checked={form.cameraEnabled}
                  onChange={(e) => setForm({ ...form, cameraEnabled: e.target.checked })}
                />
                Aktifkan Kamera Opsional (Default Nonaktif)
              </label>
            </div>
          </div>

          <div className="text-xs text-slate-600">
            Soal terpilih dari Bank Soal ({selectedQuestionIds.length} butir soal) • Kelas ditugaskan:{' '}
            {classes.map((c) => c.name).join(', ')}
          </div>

          <button
            type="submit"
            className="px-5 py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-bold"
          >
            Simpan Paket Ujian
          </button>
        </form>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-3">
          <h2 className="text-base font-bold text-slate-900">Daftar Paket Ujian & Transisi Status</h2>
          {exams.map((ex) => (
            <div
              key={ex.id}
              className="p-4 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-4"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded bg-blue-900 text-white text-xs font-bold">
                    {ex.code}
                  </span>
                  <span className="px-2.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-xs font-bold">
                    Status: {ex.status}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-semibold">
                    {ex.browser_policy}
                  </span>
                </div>
                <h3 className="font-bold text-slate-900 mt-1">{ex.title}</h3>
                <p className="text-xs text-slate-500">
                  Mapel: {ex.subject_name} • Durasi: {ex.duration_minutes} Menit •{' '}
                  {ex.question_count} Soal • Grace Offline: {ex.offline_grace_period_seconds}s • Kamera:{' '}
                  {ex.camera_enabled ? 'Aktif (Opsional)' : 'Nonaktif'}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {ex.status === 'DRAFT' && (
                  <button
                    type="button"
                    onClick={() => changeStatus(ex.id, 'SCHEDULED')}
                    className="px-3 py-1.5 rounded-lg bg-blue-700 text-white text-xs font-bold"
                  >
                    Set SCHEDULED
                  </button>
                )}
                {(ex.status === 'DRAFT' || ex.status === 'SCHEDULED') && (
                  <button
                    type="button"
                    onClick={() => changeStatus(ex.id, 'READY')}
                    className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-bold"
                  >
                    Buka Sesi (READY)
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
