import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CBT PRO — Platform Ujian Berbasis Komputer Sekolah',
  description:
    'Sistem Computer-Based Test (CBT) Terinspirasi TKA untuk 500+ Siswa Bersamaan (BYOD, Mode Offline Terbatas, RBAC 5 Role)',
  manifest: '/manifest.json',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
