'use client';

import React, { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { apiRequest } from '@/lib/api-client';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    username: '',
    email: '',
    fullName: '',
    identifierCode: '',
    password: 'CbtPro#2026',
    role: 'STUDENT',
  });

  const loadUsers = async (filter = roleFilter) => {
    setLoading(true);
    try {
      const q = filter ? `?role=${encodeURIComponent(filter)}` : '';
      const data = await apiRequest(`/users${q}`);
      setUsers(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setMessage(err.message || 'Gagal memuat daftar pengguna');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers('');
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    try {
      await apiRequest('/users', {
        method: 'POST',
        body: {
          username: form.username,
          email: form.email,
          fullName: form.fullName,
          identifierCode: form.identifierCode,
          password: form.password,
          roles: [form.role],
        },
      });
      setMessage(`Akun ${form.username} (${form.role}) berhasil ditambahkan.`);
      setForm({
        username: '',
        email: '',
        fullName: '',
        identifierCode: '',
        password: 'CbtPro#2026',
        role: 'STUDENT',
      });
      await loadUsers();
    } catch (err: any) {
      setMessage(err.message || 'Gagal membuat pengguna');
    }
  };

  const toggleActive = async (u: any) => {
    try {
      await apiRequest(`/users/${u.id}`, {
        method: 'PATCH',
        body: { isActive: !u.is_active },
      });
      await loadUsers();
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  return (
    <AppShell
      title="Manajemen Pengguna & Role (RBAC)"
      subtitle="Kelola akun Admin, Guru, Proktor, Pengawas, dan Siswa beserta status keaktifan"
    >
      <div className="space-y-6">
        {message && (
          <div className="p-3.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-sm font-medium">
            {message}
          </div>
        )}

        <form
          onSubmit={handleCreateUser}
          className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4"
        >
          <h2 className="text-base font-bold text-slate-900">Tambah Akun Pengguna Baru</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Username</label>
              <input
                type="text"
                required
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                placeholder="siswa.baru"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email Sekolah</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                placeholder="siswa@sekolah.sch.id"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Lengkap</label>
              <input
                type="text"
                required
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                placeholder="Nama Lengkap"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">NISN / NIP</label>
              <input
                type="text"
                value={form.identifierCode}
                onChange={(e) => setForm({ ...form, identifierCode: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                placeholder="NISN-008..."
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Role Utama</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              >
                <option value="STUDENT">STUDENT (Siswa)</option>
                <option value="TEACHER">TEACHER (Guru)</option>
                <option value="PROCTOR">PROCTOR (Proktor)</option>
                <option value="SUPERVISOR">SUPERVISOR (Pengawas)</option>
                <option value="ADMIN">ADMIN (Administrator)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Password Awal</label>
              <input
                type="text"
                required
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>
          </div>
          <button
            type="submit"
            className="px-5 py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-bold"
          >
            Simpan Akun Pengguna
          </button>
        </form>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-base font-bold text-slate-900">Daftar Akun Terdaftar</h2>
            <select
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                loadUsers(e.target.value);
              }}
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm"
            >
              <option value="">Semua Role (5 Role)</option>
              <option value="ADMIN">ADMIN</option>
              <option value="TEACHER">TEACHER</option>
              <option value="PROCTOR">PROCTOR</option>
              <option value="SUPERVISOR">SUPERVISOR</option>
              <option value="STUDENT">STUDENT</option>
            </select>
          </div>

          {loading ? (
            <div className="text-sm text-slate-500">Memuat data pengguna...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-600 uppercase text-xs border-b">
                  <tr>
                    <th className="py-3 px-3">Nama Lengkap</th>
                    <th className="py-3 px-3">Username</th>
                    <th className="py-3 px-3">NISN/NIP</th>
                    <th className="py-3 px-3">Role</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3">Tindakan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td className="py-3 px-3 font-semibold text-slate-900">{u.full_name}</td>
                      <td className="py-3 px-3 font-mono text-xs">{u.username}</td>
                      <td className="py-3 px-3 text-slate-600">{u.identifier_code || '-'}</td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-900 text-xs font-bold">
                          {Array.isArray(u.roles) ? u.roles.join(', ') : u.roles}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-semibold ${
                            u.is_active
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {u.is_active ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <button
                          type="button"
                          onClick={() => toggleActive(u)}
                          className="px-2.5 py-1 rounded border border-slate-300 hover:bg-slate-100 text-xs font-semibold"
                        >
                          {u.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                        </button>
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
