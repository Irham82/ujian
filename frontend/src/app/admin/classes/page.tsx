'use client';

import React, { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { apiRequest } from '@/lib/api-client';

export default function AdminClassesPage() {
  const [classes, setClasses] = useState<any[]>([]);
  const [years, setYears] = useState<any[]>([]);
  const [selectedClassMembers, setSelectedClassMembers] = useState<any[]>([]);
  const [selectedClassName, setSelectedClassName] = useState<string>('');
  const [name, setName] = useState('');
  const [gradeLevel, setGradeLevel] = useState('XII');
  const [academicYearId, setAcademicYearId] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const [cls, yrs] = await Promise.all([
        apiRequest('/academic/classes'),
        apiRequest('/academic/years'),
      ]);
      setClasses(Array.isArray(cls) ? cls : []);
      setYears(Array.isArray(yrs) ? yrs : []);
      if (Array.isArray(yrs) && yrs.length > 0 && !academicYearId) {
        setAcademicYearId(yrs[0].id);
      }
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/academic/classes', {
        method: 'POST',
        body: { academicYearId, name, gradeLevel },
      });
      setName('');
      setMessage('Kelas berhasil ditambahkan.');
      await loadData();
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  const viewMembers = async (cls: any) => {
    setSelectedClassName(cls.name);
    try {
      const members = await apiRequest(`/academic/classes/${cls.id}/members`);
      setSelectedClassMembers(Array.isArray(members) ? members : []);
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  return (
    <AppShell
      title="Manajemen Kelas & Rombongan Belajar"
      subtitle="Kelola kelas, wali kelas, dan keanggotaan siswa/guru sesuai tahun ajaran aktif"
    >
      <div className="space-y-6">
        {message && (
          <div className="p-3.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-sm font-medium">
            {message}
          </div>
        )}

        <form
          onSubmit={handleCreateClass}
          className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4"
        >
          <h2 className="text-base font-bold text-slate-900">Buat Kelas / Rombongan Belajar Baru</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tahun Ajaran</label>
              <select
                value={academicYearId}
                onChange={(e) => setAcademicYearId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              >
                {years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name} ({y.semester})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Kelas</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                placeholder="Mis. XII MIPA 3"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tingkat</label>
              <select
                value={gradeLevel}
                onChange={(e) => setGradeLevel(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              >
                <option value="X">Kelas X</option>
                <option value="XI">Kelas XI</option>
                <option value="XII">Kelas XII</option>
              </select>
            </div>
          </div>
          <button
            type="submit"
            className="px-5 py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-bold"
          >
            Tambah Kelas
          </button>
        </form>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-base font-bold text-slate-900 mb-3">Daftar Kelas</h2>
            <div className="space-y-2.5">
              {classes.map((c) => (
                <div
                  key={c.id}
                  className="p-3.5 rounded-lg border border-slate-200 flex items-center justify-between"
                >
                  <div>
                    <div className="font-bold text-slate-900">
                      {c.name} (Tingkat {c.grade_level})
                    </div>
                    <div className="text-xs text-slate-500">
                      Wali Kelas: {c.homeroom_teacher_name || '-'} • {c.student_count || 0} Siswa
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => viewMembers(c)}
                    className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-800 text-xs font-bold"
                  >
                    Lihat Anggota
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-base font-bold text-slate-900 mb-3">
              Anggota Rombel {selectedClassName ? `— ${selectedClassName}` : ''}
            </h2>
            {selectedClassMembers.length === 0 ? (
              <p className="text-sm text-slate-500">
                Pilih tombol &ldquo;Lihat Anggota&rdquo; pada salah satu kelas untuk menampilkan daftar guru & siswa.
              </p>
            ) : (
              <div className="space-y-2">
                {selectedClassMembers.map((m) => (
                  <div
                    key={m.id}
                    className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex justify-between items-center text-sm"
                  >
                    <div>
                      <div className="font-semibold text-slate-900">{m.full_name}</div>
                      <div className="text-xs text-slate-500">
                        {m.identifier_code || m.username}
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-900 text-xs font-bold">
                      {m.membership_role}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
