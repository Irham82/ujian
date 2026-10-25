'use client';

import React, { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { apiRequest } from '@/lib/api-client';
import { SEED_IDS } from '@/lib/seed-constants';

export default function ResultsAnalyticsPage() {
  const [exams, setExams] = useState<any[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>('');
  const [analytics, setAnalytics] = useState<any>(null);
  const [essayParticipantId, setEssayParticipantId] = useState<string>('');
  const [essayQuestionId, setEssayQuestionId] = useState<string>(SEED_IDS.Q5_ESSAY_ID);
  const [essayScore, setEssayScore] = useState<number>(20);
  const [essayFeedback, setEssayFeedback] = useState<string>('Jawaban tepat dan lengkap.');
  const [message, setMessage] = useState<string | null>(null);

  const loadAnalytics = async (exId: string) => {
    if (!exId) return;
    try {
      const res = await apiRequest(`/reports/exams/${exId}/analytics`);
      setAnalytics(res);
      if (Array.isArray(res?.submissions) && res.submissions.length > 0 && !essayParticipantId) {
        setEssayParticipantId(res.submissions[0].participant_id);
      }
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  useEffect(() => {
    apiRequest('/exams')
      .then((res) => {
        const list = Array.isArray(res) ? res : [];
        setExams(list);
        if (list.length > 0) {
          setSelectedExamId(list[0].id);
          loadAnalytics(list[0].id);
        }
      })
      .catch((err) => setMessage(err.message));
  }, []);

  const handleGradeEssay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!essayParticipantId) return;
    try {
      const res = await apiRequest(`/grading/participants/${essayParticipantId}/essay`, {
        method: 'POST',
        body: {
          questionId: essayQuestionId,
          scoreAwarded: Number(essayScore),
          feedback: essayFeedback,
        },
      });
      setMessage(
        `Nilai esai berhasil disimpan. Total nilai baru peserta: ${res.totalScore} (${res.gradingStatus}).`,
      );
      await loadAnalytics(selectedExamId);
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  const sum = analytics?.summary || {};

  return (
    <AppShell
      title="Hasil Ujian, Koreksi Esai Manual & Analisis Butir Soal"
      subtitle="Evaluasi statistik nilai kelas, koreksi manual soal uraian oleh Guru, dan indeks kesukaran setiap butir soal"
    >
      <div className="space-y-6">
        {message && (
          <div className="p-3.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-sm font-medium">
            {message}
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
          <label className="text-xs font-bold uppercase text-slate-500">Pilih Paket Ujian:</label>
          <select
            value={selectedExamId}
            onChange={(e) => {
              setSelectedExamId(e.target.value);
              loadAnalytics(e.target.value);
            }}
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm font-semibold"
          >
            {exams.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.code} — {ex.title}
              </option>
            ))}
          </select>
        </div>

        {/* Ringkasan Statistik */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200">
            <div className="text-xs font-bold text-slate-500">Total Pengumpulan</div>
            <div className="text-2xl font-extrabold text-slate-900 mt-1">
              {sum.totalSubmissions ?? 0}
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200">
            <div className="text-xs font-bold text-slate-500">Rata-Rata Nilai</div>
            <div className="text-2xl font-extrabold text-blue-800 mt-1">
              {sum.averageScore ?? 0}
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200">
            <div className="text-xs font-bold text-slate-500">Nilai Tertinggi</div>
            <div className="text-2xl font-extrabold text-emerald-700 mt-1">
              {sum.highestScore ?? 0}
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200">
            <div className="text-xs font-bold text-slate-500">Nilai Terendah</div>
            <div className="text-2xl font-extrabold text-amber-700 mt-1">
              {sum.lowestScore ?? 0}
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200">
            <div className="text-xs font-bold text-slate-500">Tuntas KKM</div>
            <div className="text-2xl font-extrabold text-emerald-800 mt-1">
              {sum.passedCount ?? 0} Siswa
            </div>
          </div>
        </div>

        {/* Form Penilaian Manual Esai */}
        <form
          onSubmit={handleGradeEssay}
          className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4"
        >
          <h2 className="text-base font-bold text-slate-900">
            Penilaian Manual Soal Esai oleh Guru Pengampu
          </h2>
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Participant ID Siswa
              </label>
              <input
                type="text"
                required
                value={essayParticipantId}
                onChange={(e) => setEssayParticipantId(e.target.value)}
                placeholder="UUID Participant"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Skor Esai Diberikan
              </label>
              <input
                type="number"
                required
                value={essayScore}
                onChange={(e) => setEssayScore(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Umpan Balik / Catatan Guru
              </label>
              <input
                type="text"
                value={essayFeedback}
                onChange={(e) => setEssayFeedback(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>
          </div>
          <button
            type="submit"
            className="px-5 py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold"
          >
            Simpan Nilai Manual Esai & Hitung Ulang Nilai Total
          </button>
        </form>

        {/* Analisis Butir Soal */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-base font-bold text-slate-900 mb-3">
            Analisis Butir Soal (Indeks Kesukaran & Konsistensi Versi Soal)
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-600 uppercase text-xs border-b">
                <tr>
                  <th className="py-3 px-3">No. Urut</th>
                  <th className="py-3 px-3">Versi Soal Terkunci</th>
                  <th className="py-3 px-3">Jumlah Menjawab</th>
                  <th className="py-3 px-3">Menjawab Benar</th>
                  <th className="py-3 px-3">Indeks Kesukaran (P)</th>
                  <th className="py-3 px-3">Klasifikasi</th>
                  <th className="py-3 px-3">Rata-Rata Skor / Maks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {(analytics?.itemAnalysis || []).map((item: any) => (
                  <tr key={item.questionId}>
                    <td className="py-3 px-3 font-bold">Butir #{item.orderNo}</td>
                    <td className="py-3 px-3">v{item.questionVersion}</td>
                    <td className="py-3 px-3">{item.totalAttempts}</td>
                    <td className="py-3 px-3">{item.correctCount}</td>
                    <td className="py-3 px-3 font-mono font-bold">{item.difficultyIndexP}</td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-900 text-xs font-bold">
                        {item.difficultyInterpretation}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      {item.averageScore} / {item.maxScore}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
