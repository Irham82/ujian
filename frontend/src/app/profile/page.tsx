'use client';

import React, { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import {
  apiRequest,
  formatSchoolTime,
  getSavedAuth,
  saveAuthSession,
} from '@/lib/api-client';

export default function ProfilePage() {
  const [profile, setProfile] = useState<any>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    apiRequest('/auth/me')
      .then((res) => {
        setProfile(res);
        setFullName(res.fullName || '');
        setEmail(res.email || '');
      })
      .catch(() => {
        const saved = getSavedAuth().user;
        if (saved) {
          setProfile(saved);
          setFullName(saved.fullName);
          setEmail(saved.email);
        }
      });
  }, []);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const updated = await apiRequest('/auth/profile', {
        method: 'PATCH',
        body: {
          fullName,
          email,
          currentPassword: currentPassword || undefined,
          newPassword: newPassword || undefined,
        },
      });
      setProfile(updated);
      setCurrentPassword('');
      setNewPassword('');
      setMessage('Profil pengguna berhasil diperbarui.');
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  const handleRotateSession = async () => {
    try {
      const rotated = await apiRequest('/auth/refresh', { method: 'POST' });
      const saved = getSavedAuth();
      if (saved.user) {
        saveAuthSession({
          accessToken: rotated.accessToken,
          csrfToken: rotated.csrfToken,
          user: saved.user,
        });
      }
      setMessage('Token sesi dan token CSRF berhasil dirotasi.');
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  return (
    <AppShell
      title="Profil Pengguna & Keamanan Sesi"
      subtitle="Kelola identitas akun sekolah, rotasi token sesi aktif, dan pembaruan kata sandi Argon2id"
    >
      <div className="space-y-6">
        {message && (
          <div className="p-3.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-sm font-medium">
            {message}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          <form
            onSubmit={handleUpdateProfile}
            className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4"
          >
            <h2 className="text-base font-bold text-slate-900">Data Akun & Kata Sandi</h2>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Lengkap</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email Sekolah</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Password Saat Ini (Isi jika ingin mengganti password)
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Password Baru (Minimal 8 Karakter)
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-sm font-bold"
            >
              Simpan Perubahan Profil
            </button>
          </form>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900">Informasi Sesi & Sekolah</h2>
            <div className="space-y-2 text-sm text-slate-700">
              <div>
                <strong>Username:</strong> <code className="font-mono">{profile?.username}</code>
              </div>
              <div>
                <strong>NISN / NIP:</strong> {profile?.identifierCode || '-'}
              </div>
              <div>
                <strong>Role Aktif:</strong> {profile?.roles?.join(', ')}
              </div>
              <div>
                <strong>Sekolah:</strong> {profile?.schoolName}
              </div>
              <div>
                <strong>Zona Waktu Sekolah:</strong> {profile?.schoolTimezone || 'Asia/Makassar'}
              </div>
              <div>
                <strong>Login Terakhir:</strong> {formatSchoolTime(profile?.lastLoginAt)}
              </div>
            </div>
            <button
              type="button"
              onClick={handleRotateSession}
              className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold border border-slate-300"
            >
              Rotasi Token Sesi & CSRF Sekarang
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
