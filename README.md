# CBT PRO — Secure Computer-Based Test Platform (500+ Concurrent Students | BYOD | Limited Offline)

Platform ujian berbasis komputer (*Computer-Based Test* / CBT) berkeamanan tinggi yang dirancang untuk melayani **500–750+ sesi ujian aktif bersamaan** pada perangkat **BYOD** (HP Android, iPhone, Laptop Windows, dan macOS) dengan **Mode Offline Terbatas**, **Autosave Transaksional Idempoten**, **Timer Otoritatif Server**, **5 Role RBAC Ketat**, **Integrasi Safe Exam Browser (SEB)**, serta **Kamera Opsional Berbasis Privasi**.

---

## Fitur Utama

1. **5 Peran Pengguna (Server-Side RBAC & Object-Level Authorization)**:
   - **Admin**: Manajemen pengguna, kelas, mata pelajaran, tahun ajaran, pengaturan keamanan/SEB/kamera/offline, penjadwalan sesi, audit log, serta backup & restore terenkripsi.
   - **Guru**: Manajemen bank soal miliknya, 5 tipe soal (Pilihan Ganda 1 Jawaban, Pilihan Ganda Kompleks, Benar-Salah, Isian Singkat, Esai), koreksi manual esai, serta analitik butir soal & ekspor CSV.
   - **Proktor**: Monitoring real-time kesiapan ruang & koneksi peserta, pengiriman peringatan langsung, tindakan pemulihan terotorisasi (`RESET_LOGIN`, `EXTEND_TIME_5M`, `APPROVE_SEB_EXCEPTION`, `APPROVE_CAMERA_ALTERNATIVE`), dan eskalasi insiden.
   - **Pengawas**: Verifikasi daftar hadir fisik ruang, pemantauan fokus layar peserta yang ditugaskan, dan pencatatan laporan ruang.
   - **Siswa**: Pemeriksaan kompatibilitas perangkat, pembacaan petunjuk, pengerjaan ujian berpola TKA (2 kolom di laptop, 1 kolom + laci nomor soal di HP), penanda ragu-ragu, buffer jawaban lokal IndexedDB saat offline, dan pengumpulan akhir idempoten.
2. **Database PostgreSQL 31 Tabel & Dual-Driver**:
   - Mendukung PostgreSQL eksternal (`pg.Pool`) untuk produksi/Docker maupun PostgreSQL 16 WASM tersemat (`@electric-sql/pglite`) untuk eksekusi dan pengujian lokal tanpa ketergantungan layanan luar.
3. **21 Halaman Antarmuka Pengguna Lengkap (Next.js 15 + TypeScript Strict + Tailwind CSS + PWA)**.
4. **Pengujian Otomatis & Uji Beban Terverifikasi**:
   - **18/18** suite pengujian fungsional, keamanan RBAC/OLA, 11 skenario offline, SEB, kamera opsional, dan backup/restore AES-256-GCM lulus 100%.
   - **4.255 request** pengujian beban 500–750 sesi aktif bersamaan lulus dengan **0% error rate**, `GET /paper` **p95 = 88,37 ms**, `PUT /answers` **p95 = 123,20 ms**, **0 jawaban hilang**, dan **0 duplikasi submit**.

---

## Akun Demo Bawaan (Seed Data)

| Role | Username | Password | Catatan Hak Akses |
|---|---|---|---|
| **Admin** | `admin.utama` | `CbtPro#2026` | Akses penuh sistem, konfigurasi, audit log, backup/restore |
| **Guru** | `guru.matematika` | `CbtPro#2026` | Pemilik Bank Soal & Paket Ujian TKA Matematika Kelas XII |
| **Proktor** | `proktor.lab1` | `CbtPro#2026` | Ditugaskan pada Sesi Lab Komputer 1 |
| **Pengawas** | `pengawas.ruang1` | `CbtPro#2026` | Ditugaskan mengawasi peserta Ruang Lab 1 |
| **Siswa** | `siswa.0001` s.d. `siswa.0010` | `CbtPro#2026` | Peserta terdaftar pada Sesi Ujian TKA Matematika |

---

## Perintah Cepat

```bash
# 1. Instal dependensi
npm.cmd install

# 2. Migrasi skema 31 tabel & seed data awal
npm.cmd run db:migrate
npm.cmd run db:seed

# 3. Jalankan seluruh pengujian otomatis (Fungsional, Keamanan, Offline, Backup/Restore)
npm.cmd test

# 4. Jalankan pengujian beban 500-750 sesi ujian aktif bersamaan
npm.cmd run test:load

# 5. Jalankan pemeriksaan tipe TypeScript & build produksi
npm.cmd run typecheck
npm.cmd run build
```

---

## Indeks Dokumentasi Teknis & Operasional

1. [01 — Arsitektur Sistem & Pemisahan Modul](docs/01-architecture.md)
2. [02 — ERD & Skema Database 31 Tabel PostgreSQL](docs/02-erd-and-schema.md)
3. [03 — Matriks Hak Akses (RBAC) & Object-Level Authorization](docs/03-rbac-matrix.md)
4. [04 — Threat Model, Mesin Anti-Kecurangan & Privasi Kamera](docs/04-threat-model.md)
5. [05 — Kontrak REST API & Idempotensi](docs/05-api-contract.md)
6. [06 — Spesifikasi 21 Halaman UI/UX, Mode Offline Terbatas, SEB & Kamera](docs/06-ui-ux-offline-seb-camera.md)
7. [07 — Rencana Pengujian Fungsional, Keamanan, Offline & Load Testing 500–750 Sesi](docs/07-testing-and-load-plan.md)
8. [08 — Panduan Deployment, Operasional, SOP & Kebijakan Privasi](docs/08-deployment-operations-and-guides.md)
