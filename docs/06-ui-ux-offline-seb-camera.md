# 06 — Desain UI/UX, Mode Offline Terbatas, Secure Browser (SEB) & Kamera Opsional

## 1. Desain UI/UX & Identitas Visual (Terinspirasi TKA, Visual Orisinal)
- **Palet Warna Orisinal**:
  - Primary Academic Blue: `#1E40AF` (Biru Utama), `#2563EB` (Aksen Interaktif), `#EFF6FF` (Latar Permukaan Lembut).
  - Neutral Slate: `#0F172A` (Teks Utama Kontras Tinggi WCAG AAA), `#475569` (Teks Sekunder), `#F8FAFC` (Latar Halaman), `#E2E8F0` (Garis Pembatas).
  - Semantic Status:
    - Sudah Dijawab & Tersimpan Server: Hijau (`#16A34A`).
    - Ditandai Ragu-ragu (*Review*): Kuning/Amber (`#D97706`).
    - Tersimpan Lokal (Menunggu Sinkronisasi Offline): Biru Muda/Oranye (`#0284C7` / `#EA580C`) — **tidak pernah diberi label "Tersimpan di Server" sebelum konfirmasi HTTP 200 dari backend**.
    - Belum Dijawab: Putih dengan border abu-abu (`#CBD5E1`).
    - Soal Aktif: Ring Biru Tebal (`#2563EB`).
- **21 Halaman Wajib**:
  1. Login (`/login`)
  2. Dashboard setiap role (`/dashboard` dengan tampilan spesifik Admin, Guru, Proktor, Pengawas, Siswa)
  3. Manajemen Pengguna (`/admin/users`)
  4. Manajemen Kelas (`/admin/classes`)
  5. Manajemen Mata Pelajaran (`/admin/subjects`)
  6. Bank Soal (`/question-banks`)
  7. Editor Soal (`/question-banks/[bankId]/editor`)
  8. Paket Ujian (`/exams`)
  9. Jadwal Ujian (`/exam-schedules`)
  10. Pemeriksaan Perangkat (`/student/exams/[sessionId]/device-check`)
  11. Halaman Petunjuk & Tata Tertib (`/student/exams/[sessionId]/instructions`)
  12. Halaman Pengerjaan Ujian (`/student/exams/[sessionId]/take`)
  13. Dashboard Proktor (`/proctor/dashboard`)
  14. Dashboard Pengawas (`/supervisor/dashboard`)
  15. Monitoring Keamanan (`/security-monitoring`)
  16. Hasil dan Analitik (`/results-analytics`)
  17. Laporan (`/reports`)
  18. Audit Log (`/admin/audit-logs`)
  19. Pengaturan Keamanan (`/admin/security-settings`)
  20. Pengaturan Kamera dan Offline (`/admin/camera-offline-settings`)
  21. Profil Pengguna (`/profile`)

## 2. Spesifikasi Mode Offline Terbatas
- **Syarat Mulai Ujian**: Siswa **wajib online** untuk autentikasi, pemeriksaan perangkat, dan pembuatan sesi di server.
- **Buffer Lokal IndexedDB (`cbt_pro_offline_db`)**:
  - Menyimpan naskah soal sesi aktif (tanpa kunci jawaban) dan antrean mutasi jawaban (`pending_answer_mutations`).
  - Setiap perubahan jawaban memiliki `idempotencyKey` (UUID v4), `questionId`, `answerPayload`, `isMarkedForReview`, `expectedVersion`, dan `clientUpdatedAt`.
- **Perilaku Saat Terputus & Pulih**:
  - Deteksi melalui `navigator.onLine`, kegagalan fetch/heartbeat, dan event `offline`/`online`.
  - Retry otomatis menggunakan **exponential backoff dengan full jitter** (`base = 1000ms * 2^attempt + random(0..500ms)`).
  - Saat koneksi pulih, klien terlebih dahulu memverifikasi status sesi dan sisa waktu ke server, lalu mengirim antrean jawaban secara berurutan ke `POST /api/v1/student/participants/:participantId/offline-sync`.
- **Kebijakan Konflik & Offline Grace Period**:
  - Default `offline_grace_period_seconds = 120` detik (dapat dikonfigurasi per ujian oleh Admin).
  - Jika durasi offline melewati grace period, UI menampilkan peringatan jelas dan instruksi menghubungi proktor/pengawas tanpa menghapus jawaban lokal di perangkat.
  - Jika terjadi konflik versi (`expectedVersion < serverVersion`), backend menyimpan event ke `answer_events` dan menerapkan kebijakan konflik ujian (`SERVER_WINS_LOG_BOTH` atau `LATEST_VALID_WITHIN_GRACE_WINS`) tanpa kehilangan riwayat jawaban.

## 3. Matriks Kompatibilitas Safe Exam Browser (SEB) yang Diverifikasi

Berdasarkan dokumentasi resmi **Safe Exam Browser (seb.dev)**:

| Platform / OS | Dukungan Resmi SEB | Kemampuan & Catatan Integrasi |
| :--- | :--- | :--- |
| **Windows 10 / 11 (x64)** | **Didukung Penuh (SEB 3.x)** | Mendukung peluncuran via file `.seb` / link `sebs://`, penguncian aplikasi/taskbar, dan pengiriman header `X-SafeExamBrowser-ConfigKeyHash` / `X-SafeExamBrowser-RequestHash`. |
| **macOS (11+ Intel & Apple Silicon)** | **Didukung Penuh (SEB 3.x)** | Mendukung peluncuran via `.seb` / `sebs://`, kiosk mode macOS, dan header `X-SafeExamBrowser-ConfigKeyHash`. |
| **iPhone / iPad (iOS / iPadOS)** | **Didukung Terbatas (SEB iOS App)** | Memerlukan instalasi aplikasi SEB dari App Store dan mengandalkan *Single App Mode* (MDM) atau *Guided Access* iOS agar penguncian penuh efektif. |
| **HP Android** | **TIDAK DIDUKUNG RESMI oleh SEB** | Proyek resmi Safe Exam Browser (ETH Zürich) **tidak menyediakan klien SEB resmi untuk Android**. Pada Android BYOD, sistem menggunakan mode `STANDARD_BROWSER` / PWA Fullscreen + deteksi fokus (`visibilitychange` / `blur`) atau memerlukan pengecualian kebijakan bila sekolah tidak memakai MDM khusus. |

### Tiga Kebijakan Browser Ujian (`browser_policy`)
1. `SECURE_BROWSER_REQUIRED`: Hanya menerima request dari klien dengan verifikasi SEB valid (User-Agent SEB + kecocokan `X-SafeExamBrowser-ConfigKeyHash` bila dikonfigurasi), **kecuali** proktor memberikan pengecualian resmi (`seb_override_by_proctor_id`) yang tercatat di `audit_logs` (mis. untuk peserta dengan HP Android pada sekolah BYOD).
2. `SECURE_BROWSER_OPTIONAL`: Menerima SEB maupun browser standar, serta mencatat jenis browser yang digunakan peserta.
3. `STANDARD_BROWSER`: Mengizinkan browser modern (Chrome, Safari, Edge, Firefox) dengan pemberitahuan transparan bahwa penguncian perangkat penuh tidak aktif.

## 4. Kebijakan Kamera Opsional & Privasi
- **Nonaktif secara default** (`camera_enabled = false`).
- Jika diaktifkan oleh Admin pada ujian tertentu:
  - Menampilkan layar **Pemberitahuan Privasi & Consent** sebelum ujian dimulai (tujuan pemantauan integritas, jenis data berupa snapshot berkala beresolusi rendah tanpa perekaman audio dan tanpa video streaming terus-menerus secara default, pihak yang berwenang mengakses, masa retensi `camera_retention_days`, dan prosedur alternatif).
  - Jika izin kamera ditolak atau perangkat tidak memiliki kamera, sistem mencatat event `CAMERA_UNAVAILABLE` (`ATTENTION`) dan menyediakan alur **Prosedur Alternatif Pengawasan Fisik** oleh pengawas ruang (`camera_alternative_approved`) agar siswa tetap dapat mengikuti ujian secara adil.
  - Setiap akses terhadap metadata/snapshot kamera oleh Admin/Proktor dicatat secara wajib di `audit_logs`.
