'use client';

import React, { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { apiRequest } from '@/lib/api-client';

export default function AdminSubjectsPage() {
  const [subjects, setSubjects] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [roomName, setRoomName] = useState('');
  const [capacity, setCapacity] = useState(40);
  const [message, setMessage] = useState<string | null>(null);

  const loadAll = async () => {
    try {
      const [sub, rm] = await Promise.all([
        apiRequest('/academic/subjects'),
        apiRequest('/academic/rooms'),
      ]);
      setSubjects(Array.isArray(sub) ? sub : []);
      setRooms(Array.isArray(rm) ? rm : []);
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleCreateSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/academic/subjects', {
        method: 'POST',
        body: { code, name, description },
      });
      setCode('');
      setName('');
      setDescription('');
      setMessage('Mata pelajaran berhasil ditambahkan.');
      await loadAll();
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/academic/rooms', {
        method: 'POST',
        body: { code: roomCode, name: roomName, capacity: Number(capacity) },
      });
      setRoomCode('');
      setRoomName('');
      setMessage('Ruang ujian berhasil ditambahkan.');
      await loadAll();
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  return (
    <AppShell
      title="Manajemen Mata Pelajaran & Ruang Ujian"
      subtitle="Kelola kode mata pelajaran TKA/Sekolah serta kapasitas ruang laboratorium ujian"
    >
      <div className="space-y-6">
        {message && (
          <div className="p-3.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-sm font-medium">
            {message}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          <form
            onSubmit={handleCreateSubject}
            className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-3"
          >
            <h2 className="text-base font-bold text-slate-900">Tambah Mata Pelajaran</h2>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Kode Mapel</label>
              <input
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                placeholder="BIO-TKA"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Mata Pelajaran</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                placeholder="Biologi Saintek & TKA"
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
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-bold"
            >
              Simpan Mata Pelajaran
            </button>
          </form>

          <form
            onSubmit={handleCreateRoom}
            className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-3"
          >
            <h2 className="text-base font-bold text-slate-900">Tambah Ruang Ujian</h2>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Kode Ruang</label>
              <input
                type="text"
                required
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                placeholder="LAB-CBT-03"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Ruang</label>
              <input
                type="text"
                required
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                placeholder="Ruang Multimedia & BYOD"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Kapasitas Peserta</label>
              <input
                type="number"
                required
                value={capacity}
                onChange={(e) => setCapacity(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-bold"
            >
              Simpan Ruang Ujian
            </button>
          </form>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h3 className="text-base font-bold text-slate-900 mb-3">Daftar Mata Pelajaran</h3>
            <div className="space-y-2">
              {subjects.map((s) => (
                <div key={s.id} className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="font-bold text-slate-900">
                    {s.code} — {s.name}
                  </div>
                  <div className="text-xs text-slate-600">{s.description || '-'}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h3 className="text-base font-bold text-slate-900 mb-3">Daftar Ruang Ujian</h3>
            <div className="space-y-2">
              {rooms.map((r) => (
                <div key={r.id} className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex justify-between">
                  <div>
                    <div className="font-bold text-slate-900">
                      {r.code} — {r.name}
                    </div>
                    <div className="text-xs text-slate-600">{r.location || 'Gedung Sekolah'}</div>
                  </div>
                  <span className="px-2.5 py-1 rounded bg-blue-100 text-blue-900 text-xs font-bold self-center">
                    Kapasitas: {r.capacity}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
