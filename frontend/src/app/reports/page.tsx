'use client';

import React, { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { apiRequest, formatSchoolTime } from '@/lib/api-client';
import { SEED_IDS } from '@/lib/seed-constants';

export default function ReportsPage() {
  const [exams, setExams] = useState<any[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>(SEED_IDS.EXAM_TKA_UTAMA_ID);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const loadReport = async (exId: string) => {
    try {
      const res = await apiRequest(`/reports/exams/${exId}/analytics`);
      setSubmissions(Array.isArray(res?.submissions) ? res.submissions : []);
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
          loadReport(list[0].id);
        }
      })
      .catch(() => {});
  }, []);

  const handleDownloadCsv = async () => {
    try {
      const res = await apiRequest(`/reports/exams/${selectedExamId}/export/csv`);
      const csvText = res?.content || '';
      const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rekap-nilai-${selectedExamId}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage('File laporan CSV/Excel berhasil diunduh.');
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  const handlePrintPdf = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  return (
    <AppShell
      title="Laporan Nilai, Berita Acara & Ekspor (CSV / XLSX / PDF)"
      subtitle="Unduh rekapitulasi nilai resmi per paket ujian serta berita acara pengawasan"
    >
      <div className="space-y-6">
        {message && (
          <div className="p-3.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-sm font-medium">
            {message}
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <label className="text-xs font-bold uppercase text-slate-500">Paket Ujian:</label>
            <select
              value={selectedExamId}
              onChange={(e) => {
                setSelectedExamId(e.target.value);
                loadReport(e.target.value);
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

          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={handleDownloadCsv}
              className="px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold"
            >
              Unduh CSV / Spreadsheet (XLSX Compatible)
            </button>
            <button
              type="button"
              onClick={handlePrintPdf}
              className="px-4 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold"
            >
              Cetak / Simpan Laporan PDF
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-base font-bold text-slate-900 mb-4">
            Tabel Rekapitulasi Nilai Peserta Ujian
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-600 uppercase text-xs border-b">
                <tr>
                  <th className="py-3 px-3">Nama Peserta</th>
                  <th className="py-3 px-3">NISN/Kode</th>
                  <th className="py-3 px-3">Kelas</th>
                  <th className="py-3 px-3">Nilai Objektif</th>
                  <th className="py-3 px-3">Nilai Esai</th>
                  <th className="py-3 px-3">Total Nilai</th>
                  <th className="py-3 px-3">Status Koreksi</th>
                  <th className="py-3 px-3">Waktu Submit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {submissions.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-slate-500">
                      Belum ada peserta yang mengumpulkan jawaban pada ujian ini.
                    </td>
                  </tr>
                ) : (
                  submissions.map((s) => (
                    <tr key={s.participant_id}>
                      <td className="py-3 px-3 font-bold text-slate-900">{s.student_name}</td>
                      <td className="py-3 px-3 font-mono text-xs">{s.identifier_code}</td>
                      <td className="py-3 px-3">{s.class_name}</td>
                      <td className="py-3 px-3">{s.auto_score}</td>
                      <td className="py-3 px-3">{s.manual_score}</td>
                      <td className="py-3 px-3 font-extrabold text-blue-900">{s.total_score}</td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 text-xs font-bold">
                          {s.grading_status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-xs text-slate-500">
                        {formatSchoolTime(s.submitted_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
