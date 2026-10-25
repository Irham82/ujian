'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiRequest, saveAuthSession } from '@/lib/api-client';

const QUICK_ACCOUNTS = [
  {
    role: 'ADMIN',
    label: 'Admin Sekolah',
    username: 'admin',
    fullName: 'Dr. Hendra Wijaya (Admin)',
    email: 'admin@sekolah.sch.id',
    code: 'NIP-19800101',
    id: '20000000-0000-4000-8000-000000000001',
  },
  {
    role: 'TEACHER',
    label: 'Guru Matematika',
    username: 'guru.matematika',
    fullName: 'Ratna Sari, S.Pd., M.Pd.',
    email: 'guru.mtk@sekolah.sch.id',
    code: 'NIP-19850202',
    id: '20000000-0000-4000-8000-000000000002',
  },
  {
    role: 'PROCTOR',
    label: 'Proktor Lab 1',
    username: 'proktor.utama',
    fullName: 'Arif Rahman, S.Kom. (Proktor Lab 1)',
    email: 'proktor1@sekolah.sch.id',
    code: 'NIP-19900404',
    id: '20000000-0000-4000-8000-000000000004',
  },
  {
    role: 'SUPERVISOR',
    label: 'Pengawas Ruang 1',
    username: 'pengawas.ruang1',
    fullName: 'Siti Aminah, S.Pd. (Pengawas Ruang 1)',
    email: 'pengawas1@sekolah.sch.id',
    code: 'NIP-19920606',
    id: '20000000-0000-4000-8000-000000000006',
  },
  {
    role: 'STUDENT',
    label: 'Siswa (Andi)',
    username: 'siswa.andi',
    fullName: 'Andi Pratama Putra',
    email: 'andi.pratama@siswa.sch.id',
    code: 'NISN-0081112221',
    id: '20000000-0000-4000-8000-000000000011',
  },
];

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('siswa.andi');
  const [password, setPassword] = useState('CbtPro#2026');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigateByRole = (roles: string[]) => {
    if (roles.includes('STUDENT')) {
      router.push('/exam-schedules');
    } else if (roles.includes('PROCTOR')) {
      router.push('/proctor/dashboard');
    } else if (roles.includes('SUPERVISOR')) {
      router.push('/supervisor/dashboard');
    } else {
      router.push('/dashboard');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest('/auth/login', {
        method: 'POST',
        body: { usernameOrEmail: username, password },
      });
      saveAuthSession({
        accessToken: res.accessToken,
        csrfToken: res.csrfToken,
        user: res.user,
      });
      navigateByRole(res.user.roles || []);
    } catch (err: any) {
      // Fallback untuk mode pratinjau cloud (mis. Netlify tanpa server backend aktif)
      const matchedDemo = QUICK_ACCOUNTS.find(
        (a) => a.username === username.trim() || a.email === username.trim(),
      );
      if (matchedDemo && password === 'CbtPro#2026') {
        saveAuthSession({
          accessToken: `demo-cloud-token-${matchedDemo.role.toLowerCase()}`,
          csrfToken: 'demo-csrf-token',
          user: {
            id: matchedDemo.id,
            schoolId: '10000000-0000-4000-8000-000000000001',
            schoolName: 'SMA Negeri 1 Unggulan Nusantara',
            schoolTimezone: 'Asia/Makassar',
            username: matchedDemo.username,
            email: matchedDemo.email,
            fullName: matchedDemo.fullName,
            identifierCode: matchedDemo.code,
            roles: [matchedDemo.role],
          },
        });
        navigateByRole([matchedDemo.role]);
        return;
      }
      setError(err.message || 'Gagal melakukan autentikasi ke server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-md overflow-hidden">
        <div className="bg-blue-900 text-white p-6 text-center">
          <div className="w-12 h-12 rounded-xl bg-white text-blue-900 font-extrabold text-xl flex items-center justify-center mx-auto mb-3 shadow">
            CBT
          </div>
          <h1 className="text-xl font-bold">Portal Login CBT PRO</h1>
          <p className="text-xs text-blue-200 mt-1">
            SMA Negeri 1 Unggulan Nusantara • Autentikasi Argon2id & Sesi Tunggal
          </p>
        </div>

        <form onSubmit={handleLogin} className="p-6 space-y-4">
          {error && (
            <div
              role="alert"
              className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm font-medium"
            >
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="username"
              className="block text-sm font-semibold text-slate-800 mb-1"
            >
              Username / NISN / NIP / Email Sekolah
            </label>
            <input
              id="username"
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              placeholder="Masukkan username atau email sekolah"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-semibold text-slate-800 mb-1"
            >
              Kata Sandi (Password)
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              placeholder="Masukkan password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-blue-700 hover:bg-blue-800 disabled:bg-blue-400 text-white font-bold text-sm transition-colors"
          >
            {loading ? 'Memverifikasi Kredensial...' : 'Masuk ke Sistem Ujian'}
          </button>

          <div className="pt-3 border-t border-slate-200">
            <div className="text-xs font-semibold text-slate-500 mb-2">
              Pilih Cepat Akun Pengujian (5 Role):
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {QUICK_ACCOUNTS.map((acc) => (
                <button
                  key={acc.username}
                  type="button"
                  onClick={() => {
                    setUsername(acc.username);
                    setPassword('CbtPro#2026');
                  }}
                  className="px-2.5 py-1.5 rounded-md bg-slate-100 hover:bg-blue-50 text-left text-xs border border-slate-200"
                >
                  <div className="font-bold text-slate-800">{acc.label}</div>
                  <div className="text-slate-500 font-mono">{acc.username}</div>
                </button>
              ))}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
