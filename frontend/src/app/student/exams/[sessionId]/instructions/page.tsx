'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { apiRequest } from '@/lib/api-client';

export default function ExamInstructionsPage() {
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();
  const sessionId = params?.sessionId || '';
  const [examInfo, setExamInfo] = useState<any>(null);
  const [agreed, setAgreed] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest('/student/exams')
      .then((res) => {
        const list = Array.isArray(res?.exams) ? res.exams : [];
        const match = list.find((e: any) => e.session_id === sessionId) || list[0];
        setExamInfo(match || null);
      })
      .catch(() => {});
  }, [sessionId]);

  const handleStartExam = async () => {
    setStarting(true);
    setError(null);
    try {
      await apiRequest(`/student/exams/${sessionId}/start`, {
        method: 'POST',
      });
      router.push(`/student/exams/${sessionId}/take`);
    } catch (err: any) {
      setError(err.message || 'Gagal memulai sesi ujian');
      setStarting(false);
    }
  };

  return (
    <AppShell
      title="Petunjuk Pengerjaan & Tata Tertib Peserta Ujian"
      subtitle="Harap baca seluruh ketentuan integritas jawaban, timer berbasis server, dan mekanisme pemulihan koneksi sebelum memulai"
    >
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
        {error && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm font-semibold">
            {error}
          </div>
        )}

        {examInfo && (
          <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 grid sm:grid-cols-3 gap-3 text-sm">
            <div>
              <div className="text-xs font-bold uppercase text-blue-700">Mata Ujian</div>
              <div className="font-bold text-slate-900">{examInfo.exam_title}</div>
            </div>
            <div>
              <div className="text-xs font-bold uppercase text-blue-700">Durasi & Timer Server</div>
              <div className="font-bold text-slate-900">{examInfo.duration_minutes} Menit (Waktu Server UTC)</div>
            </div>
            <div>
              <div className="text-xs font-bold uppercase text-blue-700">Toleransi Gangguan Koneksi</div>
              <div className="font-bold text-slate-900">
                Mode Offline Terbatas ({examInfo.offline_grace_period_seconds} Detik)
              </div>
            </div>
          </div>
        )}

        <div className="space-y-3 text-sm text-slate-700 leading-relaxed">
          <h2 className="text-base font-bold text-slate-900">Tata Tertib & Prinsip Integritas Ujian:</h2>
          <ol className="list-decimal pl-5 space-y-2">
            <li>
              <strong>Waktu Berbasis Server:</strong> Batas waktu pengerjaan ditetapkan oleh server dalam UTC. Mengubah jam pada HP atau laptop tidak akan menambah waktu ujian Anda.
            </li>
            <li>
              <strong>Status Penyimpanan Jawaban yang Jujur:</strong> Jawaban hanya ditandai{' '}
              <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-xs">
                Tersimpan di Server
              </span>{' '}
              setelah server mengonfirmasi penyimpanan. Jika koneksi terputus sementara, jawaban disimpan di buffer IndexedDB perangkat Anda dengan label{' '}
              <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-bold text-xs">
                Tersimpan Lokal (Menunggu Sinkronisasi)
              </span>{' '}
              dan dikirim otomatis secara berurutan ketika koneksi pulih.
            </li>
            <li>
              <strong>Mode Offline Tidak Menghentikan Timer:</strong> Jika koneksi internet terputus, hitung mundur waktu ujian di server tetap berjalan sesuai jadwal. Segera lapor kepada Pengawas/Proktor jika gangguan koneksi melampaui batas toleransi ({examInfo?.offline_grace_period_seconds || 120} detik).
            </li>
            <li>
              <strong>Pemantauan Fokus & Sesi Tunggal:</strong> Perpindahan tab/jendela (`visibilitychange` / `blur`) serta percobaan membuka akun pada perangkat kedua dicatat oleh sistem untuk ditinjau oleh Proktor.
            </li>
          </ol>
        </div>

        <label className="flex items-center gap-2.5 p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-semibold text-slate-900 cursor-pointer">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300"
          />
          Saya telah membaca petunjuk pengerjaan, memeriksa kompatibilitas perangkat, dan siap mengerjakan ujian secara jujur.
        </label>

        <div className="flex flex-wrap justify-between items-center gap-3 pt-2">
          <Link
            href={`/student/exams/${sessionId}/device-check`}
            className="px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-700 text-xs font-bold"
          >
            Kembali ke Pemeriksaan Perangkat
          </Link>
          <button
            type="button"
            disabled={!agreed || starting}
            onClick={handleStartExam}
            className="px-6 py-3 rounded-xl bg-blue-700 hover:bg-blue-800 disabled:bg-slate-300 text-white text-sm font-bold shadow-sm"
          >
            {starting ? 'Membuat / Memvalidasi Sesi di Server...' : 'Mulai Mengerjakan Ujian Sekarang'}
          </button>
        </div>
      </div>
    </AppShell>
  );
}
