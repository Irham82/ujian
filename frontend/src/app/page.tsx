import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
      <header className="bg-blue-900 text-white py-5 px-6 border-b border-blue-800">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white text-blue-900 font-extrabold flex items-center justify-center text-lg">
              CBT
            </div>
            <div>
              <h1 className="font-bold text-lg">CBT PRO — Platform Ujian Sekolah</h1>
              <p className="text-xs text-blue-200">
                500+ Peserta Aktif Bersamaan • BYOD • Mode Offline Terbatas • RBAC 5 Role
              </p>
            </div>
          </div>
          <Link
            href="/login"
            className="px-4 py-2 rounded-lg bg-white text-blue-900 font-bold text-sm hover:bg-blue-50"
          >
            Masuk ke Portal Ujian
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12 grid md:grid-cols-2 gap-8 items-center">
        <div className="space-y-4">
          <span className="inline-block px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-bold uppercase tracking-wider">
            Sistem Operasional Ujian Sekolah
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 leading-tight">
            Integritas Jawaban Terjamin, Waktu Berbasis Server, dan Tangguh Menghadapi Gangguan Jaringan.
          </h2>
          <p className="text-slate-600 text-base leading-relaxed">
            Dirancang dengan pola interaksi terinspirasi Tes Kompetensi Akademik (TKA) untuk laptop Windows, macOS, HP Android, dan iPhone dengan lima role terpisah: Admin, Guru, Proktor, Pengawas, dan Siswa.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              href="/login"
              className="px-6 py-3 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-bold text-sm shadow-sm"
            >
              Login Sekarang
            </Link>
            <Link
              href="/dashboard"
              className="px-6 py-3 rounded-xl bg-white hover:bg-slate-100 text-slate-800 font-semibold text-sm border border-slate-300"
            >
              Buka Dashboard Role
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <h3 className="font-bold text-slate-900 text-lg">Akses Cepat 5 Role (Akun Simulasi Seed)</h3>
          <div className="space-y-2 text-sm">
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex justify-between">
              <span className="font-semibold text-slate-800">1. Admin Sekolah</span>
              <code className="text-blue-700 font-mono">admin / CbtPro#2026</code>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex justify-between">
              <span className="font-semibold text-slate-800">2. Guru Matematika</span>
              <code className="text-blue-700 font-mono">guru.matematika / CbtPro#2026</code>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex justify-between">
              <span className="font-semibold text-slate-800">3. Proktor Ujian</span>
              <code className="text-blue-700 font-mono">proktor.utama / CbtPro#2026</code>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex justify-between">
              <span className="font-semibold text-slate-800">4. Pengawas Ruang</span>
              <code className="text-blue-700 font-mono">pengawas.ruang1 / CbtPro#2026</code>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex justify-between">
              <span className="font-semibold text-slate-800">5. Siswa Peserta</span>
              <code className="text-blue-700 font-mono">siswa.andi / CbtPro#2026</code>
            </div>
          </div>
        </div>
      </main>

      <footer className="bg-white border-t border-slate-200 py-4 px-6 text-center text-xs text-slate-500">
        CBT PRO — Arsitektur Modular, Server Single Source of Truth, PostgreSQL ACID & IndexedDB Offline Buffer
      </footer>
    </div>
  );
}
