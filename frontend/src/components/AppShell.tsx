'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  apiRequest,
  clearAuthSession,
  CurrentUserSession,
  getSavedAuth,
} from '@/lib/api-client';

interface NavItem {
  label: string;
  href: string;
  roles: string[];
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard Role', href: '/dashboard', roles: ['ADMIN', 'TEACHER', 'PROCTOR', 'SUPERVISOR', 'STUDENT'] },
  { label: 'Manajemen Pengguna', href: '/admin/users', roles: ['ADMIN'] },
  { label: 'Manajemen Kelas & Rombel', href: '/admin/classes', roles: ['ADMIN', 'TEACHER'] },
  { label: 'Mata Pelajaran', href: '/admin/subjects', roles: ['ADMIN', 'TEACHER'] },
  { label: 'Bank Soal', href: '/question-banks', roles: ['ADMIN', 'TEACHER'] },
  { label: 'Editor Soal', href: '/question-editor', roles: ['ADMIN', 'TEACHER'] },
  { label: 'Paket Ujian', href: '/exams', roles: ['ADMIN', 'TEACHER'] },
  { label: 'Jadwal & Sesi Ujian', href: '/exam-schedules', roles: ['ADMIN', 'TEACHER', 'PROCTOR', 'SUPERVISOR', 'STUDENT'] },
  { label: 'Dashboard Proktor', href: '/proctor/dashboard', roles: ['ADMIN', 'PROCTOR'] },
  { label: 'Dashboard Pengawas', href: '/supervisor/dashboard', roles: ['ADMIN', 'PROCTOR', 'SUPERVISOR'] },
  { label: 'Monitoring Keamanan', href: '/security-monitoring', roles: ['ADMIN', 'PROCTOR'] },
  { label: 'Hasil & Analitik', href: '/results-analytics', roles: ['ADMIN', 'TEACHER'] },
  { label: 'Laporan & Ekspor', href: '/reports', roles: ['ADMIN', 'TEACHER', 'PROCTOR', 'SUPERVISOR'] },
  { label: 'Audit Log', href: '/admin/audit-logs', roles: ['ADMIN', 'PROCTOR'] },
  { label: 'Pengaturan Keamanan & SEB', href: '/admin/security-settings', roles: ['ADMIN'] },
  { label: 'Pengaturan Kamera & Offline', href: '/admin/camera-offline-settings', roles: ['ADMIN'] },
  { label: 'Profil Pengguna', href: '/profile', roles: ['ADMIN', 'TEACHER', 'PROCTOR', 'SUPERVISOR', 'STUDENT'] },
];

export default function AppShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<CurrentUserSession | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  useEffect(() => {
    const saved = getSavedAuth();
    setUser(saved.user);
    if (typeof window !== 'undefined') {
      setIsOnline(window.navigator.onLine);
      const handleOnline = () => setIsOnline(true);
      const handleOffline = () => setIsOnline(false);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
      }
      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }
  }, []);

  const handleLogout = async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } catch {
      // ignore network error on logout
    }
    clearAuthSession();
    router.push('/login');
  };

  const activeRoles = user?.roles || ['ADMIN', 'TEACHER', 'PROCTOR', 'SUPERVISOR', 'STUDENT'];
  const visibleNav = NAV_ITEMS.filter((item) =>
    item.roles.some((r) => activeRoles.includes(r)),
  );

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Top Academic Header */}
      <header className="bg-blue-900 text-white border-b border-blue-800 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-md bg-blue-800 hover:bg-blue-700 text-white text-sm font-medium"
              aria-label="Buka Menu Navigasi"
            >
              Menu
            </button>
            <Link href="/dashboard" className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-white text-blue-900 font-extrabold flex items-center justify-center text-base shadow-sm">
                CBT
              </div>
              <div>
                <div className="font-bold tracking-tight text-base leading-none">
                  CBT PRO NUSANTARA
                </div>
                <div className="text-xs text-blue-200 mt-0.5">
                  {user?.schoolName || 'Sistem Ujian Berbasis Komputer Sekolah'} •{' '}
                  {user?.schoolTimezone || 'Asia/Makassar'}
                </div>
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 ${
                isOnline
                  ? 'bg-emerald-500/20 text-emerald-100 border border-emerald-400/40'
                  : 'bg-amber-500/20 text-amber-100 border border-amber-400/40'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isOnline ? 'bg-emerald-400' : 'bg-amber-400'
                }`}
              />
              {isOnline ? 'Terhubung Server' : 'Mode Offline Terbatas'}
            </span>

            {user ? (
              <div className="flex items-center gap-3">
                <div className="hidden sm:block text-right">
                  <div className="text-sm font-semibold leading-tight">{user.fullName}</div>
                  <div className="text-xs text-blue-200">
                    Role: {user.roles.join(', ')}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="px-3 py-1.5 rounded-md bg-blue-800 hover:bg-blue-700 text-xs font-semibold border border-blue-700"
                >
                  Keluar
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="px-3.5 py-1.5 rounded-md bg-white text-blue-900 text-xs font-bold hover:bg-blue-50"
              >
                Login
              </Link>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col lg:flex-row gap-6">
        {/* Sidebar Navigation */}
        <aside
          className={`w-full lg:w-64 shrink-0 ${
            mobileMenuOpen ? 'block' : 'hidden lg:block'
          }`}
        >
          <nav
            aria-label="Navigasi Utama CBT PRO"
            className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 space-y-1"
          >
            <div className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-400">
              Modul Sistem (21 Halaman)
            </div>
            {visibleNav.map((item) => {
              const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? 'bg-blue-700 text-white font-semibold'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 min-w-0">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 sm:p-6 mb-6">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">{title}</h1>
            {subtitle && <p className="text-sm text-slate-600 mt-1">{subtitle}</p>}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
