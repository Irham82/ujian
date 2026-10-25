# 01 — Arsitektur Sistem CBT PRO

## 1. Visi dan Prinsip Arsitektur

CBT PRO adalah platform ujian berbasis komputer (*Computer-Based Test*) untuk lingkungan sekolah (BYOD & laboratorium komputer) yang dirancang mendukung **500+ peserta ujian aktif secara bersamaan** di perangkat Android, iPhone, laptop Windows, dan laptop macOS.

### 1.1 Dua Belas Modul Fungsional
Sistem memisahkan tanggung jawab ke dalam 12 modul terisolasi:
1. **Antarmuka Pengguna (`frontend/`)**: Aplikasi web responsif berbasis Next.js (App Router), React, TypeScript strict mode, Tailwind CSS, PWA manifest + service worker, dan IndexedDB local buffer.
2. **API Backend (`backend/src/common`, `backend/src/main.ts`)**: REST API berbasis NestJS dengan validasi input ketat, dokumentasi OpenAPI/Swagger, dan struktur modular.
3. **Autentikasi dan Otorisasi (`backend/src/modules/auth`)**: Hashing password **Argon2id**, manajemen sesi berbasis token & HttpOnly cookie, proteksi CSRF, rotasi/pencabutan sesi, rate limiting brute-force, serta RBAC + Object-Level Authorization untuk 5 role (`ADMIN`, `TEACHER`, `PROCTOR`, `SUPERVISOR`, `STUDENT`).
4. **Manajemen Ujian & Akademik (`backend/src/modules/academic`, `backend/src/modules/exams`)**: Pengelolaan sekolah, tahun ajaran, kelas, rombel, mata pelajaran, ruang, bank soal, paket ujian, jadwal, serta penugasan proktor dan pengawas.
5. **Mesin Pengerjaan Ujian (`backend/src/modules/exam-engine`)**: State machine 8 status (`DRAFT`, `SCHEDULED`, `READY`, `IN_PROGRESS`, `PAUSED`, `SUBMITTED`, `EXPIRED`, `CANCELLED`), otorisasi sesi, pengacakan soal & opsi deterministik per peserta, dan penegakan timer server (UTC).
6. **Penyimpanan Jawaban (`backend/src/modules/answers`)**: Penyimpanan jawaban transaksional dengan `idempotency_key`, optimistic concurrency (`answer_version`), dan riwayat audit perubahan jawaban (`answer_events`).
7. **Sistem Penilaian (`backend/src/modules/grading`)**: Koreksi otomatis untuk Pilihan Ganda (1 jawaban), Pilihan Ganda Kompleks, Benar-Salah, dan Isian Singkat, serta penilaian manual untuk Esai yang terikat pada versi soal saat ujian berlangsung (`grading_records`).
8. **Monitoring Proktor dan Pengawas (`backend/src/modules/monitoring`)**: Pemantauan real-time/adaptif status peserta, koneksi, sinkronisasi jawaban, presensi (`attendance_records`), laporan insiden (`incident_reports`), pemberian peringatan, dan pemulihan sesi.
9. **Mesin Pencatatan Kejadian Keamanan (`backend/src/modules/security-events`)**: Validasi dan klasifikasi 16 jenis event keamanan (`INFORMATION`, `ATTENTION`, `REVIEW_REQUIRED`, `SECURITY_INCIDENT`) serta pencatatan `audit_logs` yang tidak dapat dihapus oleh pengawas/siswa.
10. **Sinkronisasi Offline (`backend/src/modules/offline-sync`)**: Pemrosesan batch jawaban dari buffer IndexedDB setelah koneksi pulih (`offline_sync_batches`), penegakan `offline_grace_period_seconds`, dan resolusi konflik versi jawaban tanpa menghapus data secara diam-diam.
11. **Pelaporan dan Analitik (`backend/src/modules/reports`)**: Rekap nilai, statistik kelas, analisis butir soal (tingkat kesukaran & daya pembeda), serta ekspor CSV/XLSX/PDF.
12. **Infrastruktur dan Observabilitas (`backend/src/modules/observability`, `infra/`)**: Health checks, metrik performa (latensi p50/p95/p99, panjang antrean, koneksi DB), structured logging dengan redaksi data sensitif, Docker, Nginx reverse proxy HTTPS, dan skrip pengujian beban Grafana k6.

### 1.2 Prinsip Kebenaran dan Keamanan
- **Server sebagai Sumber Kebenaran Tunggal (*Single Source of Truth*)**: Waktu mulai, waktu berakhir, sisa waktu, status sesi, otorisasi akses soal, dan nilai akhir dihitung serta ditegakkan di server menggunakan waktu UTC. Jam lokal perangkat siswa hanya dipakai untuk merender hitung mundur visual yang disinkronkan dengan offset waktu server.
- **Transaksi Database ACID**: Operasi kritis (memulai sesi, menyimpan jawaban, sinkronisasi batch offline, pengumpulan akhir, dan penilaian) dijalankan di dalam transaksi `BEGIN ... COMMIT` PostgreSQL dengan penguncian baris (`SELECT ... FOR UPDATE`) atau klausa `ON CONFLICT` yang idempoten.
- **Kunci Jawaban Tidak Pernah Dikirim ke Klien Siswa**: Endpoint pengambilan soal siswa memiliki serializer khusus yang memfilter `correct_answer`, `answer_key`, `explanation`, dan `scoring_rubric` pada level query maupun DTO.
- **Fail Safely & Honest Security**: Gangguan jaringan atau berpindah tab tidak langsung menjatuhkan sanksi otomatis, melainkan diklasifikasikan secara proporsional untuk ditinjau proktor. Batasan keamanan browser standar pada perangkat BYOD didokumentasikan secara transparan.
