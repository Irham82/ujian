'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { apiRequest } from '@/lib/api-client';

export default function QuestionBanksPage() {
  const [banks, setBanks] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [selectedBankQuestions, setSelectedBankQuestions] = useState<any[]>([]);
  const [selectedBankTitle, setSelectedBankTitle] = useState<string>('');
  const [subjectId, setSubjectId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isShared, setIsShared] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadBanks = async () => {
    try {
      const [bks, subs] = await Promise.all([
        apiRequest('/question-banks'),
        apiRequest('/academic/subjects'),
      ]);
      setBanks(Array.isArray(bks) ? bks : []);
      setSubjects(Array.isArray(subs) ? subs : []);
      if (Array.isArray(subs) && subs.length > 0 && !subjectId) {
        setSubjectId(subs[0].id);
      }
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  useEffect(() => {
    loadBanks();
  }, []);

  const handleCreateBank = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/question-banks', {
        method: 'POST',
        body: { subjectId, title, description, isShared },
      });
      setTitle('');
      setDescription('');
      setMessage('Bank soal baru berhasil dibuat.');
      await loadBanks();
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  const viewQuestions = async (bank: any) => {
    setSelectedBankTitle(bank.title);
    try {
      const q = await apiRequest(`/question-banks/${bank.id}/questions`);
      setSelectedBankQuestions(Array.isArray(q) ? q : []);
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  const exportBankJson = async (bank: any) => {
    try {
      const exported = await apiRequest(`/question-banks/${bank.id}/export`);
      const blob = new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bank-soal-${bank.id}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  return (
    <AppShell
      title="Manajemen Bank Soal"
      subtitle="Kelola bank soal per mata pelajaran, riwayat versi soal, serta ekspor/impor terstruktur"
    >
      <div className="space-y-6">
        {message && (
          <div className="p-3.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-sm font-medium">
            {message}
          </div>
        )}

        <form
          onSubmit={handleCreateBank}
          className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">Buat Bank Soal Baru</h2>
            <Link
              href="/question-editor"
              className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold"
            >
              + Buka Editor Soal (5 Tipe Soal)
            </Link>
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Mata Pelajaran</label>
              <select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              >
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} — {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Judul Bank Soal</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                placeholder="Bank Soal TKA Semester Ganjil"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Deskripsi</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>
          </div>
          <div className="flex items-center justify-between pt-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={isShared}
                onChange={(e) => setIsShared(e.target.checked)}
                className="rounded border-slate-300"
              />
              Bagikan (Read-Only) dengan guru mata pelajaran sejawat
            </label>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-bold"
            >
              Simpan Bank Soal
            </button>
          </div>
        </form>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-base font-bold text-slate-900 mb-4">Daftar Bank Soal Tersedia</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {banks.map((b) => (
              <div key={b.id} className="p-4 rounded-xl border border-slate-200 space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-900 text-xs font-bold">
                      {b.subject_code}
                    </span>
                    <h3 className="font-bold text-slate-900 mt-1">{b.title}</h3>
                    <p className="text-xs text-slate-500">
                      Pemilik: {b.owner_name} • {b.question_count || 0} Butir Soal
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => viewQuestions(b)}
                    className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold"
                  >
                    Lihat Daftar Soal
                  </button>
                  <Link
                    href={`/question-editor?bankId=${b.id}`}
                    className="px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold"
                  >
                    Tambah / Edit Soal
                  </Link>
                  <button
                    type="button"
                    onClick={() => exportBankJson(b)}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-xs font-semibold"
                  >
                    Ekspor JSON
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {selectedBankTitle && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-3">
            <h2 className="text-base font-bold text-slate-900">
              Butir Soal dalam: {selectedBankTitle}
            </h2>
            {selectedBankQuestions.map((q, idx) => (
              <div key={q.id} className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded bg-blue-900 text-white text-xs font-bold">
                      Soal #{idx + 1}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-900 text-xs font-bold">
                      {q.question_type}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-800 text-xs font-semibold">
                      Versi {q.version} • {q.difficulty} • Bobot: {q.default_weight}
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-emerald-700">{q.status}</span>
                </div>
                <div
                  className="text-sm text-slate-900"
                  dangerouslySetInnerHTML={{ __html: q.stem_html }}
                />
                {q.formula_latex && (
                  <div className="text-xs font-mono bg-white px-2.5 py-1.5 rounded border border-slate-200">
                    Rumus (LaTeX): {q.formula_latex}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
