# 08 — Panduan Deployment, Operasional, SOP & Kebijakan Privasi CBT PRO

## 1. Panduan Instalasi & Menjalankan Lokal / Development

### 1.1 Prasyarat
- **Node.js**: v20+ atau v22+
- **Docker & Docker Compose** (opsional untuk development lokal karena CBT PRO menyediakan mesin PostgreSQL 16 WASM `@electric-sql/pglite` dan Redis in-memory fallback, wajib untuk staging/production)

### 1.2 Menjalankan Tanpa Docker (Zero-Dependency Local Mode)
1. Salin berkas variabel lingkungan:
   ```bash
   cp .env.example .env
   ```
2. Instal dependensi workspace:
   ```bash
   npm install
   ```
3. Jalankan migrasi dan seed data awal (5 akun role standar + 5 tipe soal TKA + sesi ujian aktif):
   ```bash
   npm run db:migrate
   npm run db:seed
   ```
4. Jalankan rangkaian pengujian otomatis dan pengujian beban:
   ```bash
   npm test
   npm run test:load
   ```
5. Jalankan server pengembangan (Backend di `:4000`, Frontend di `:3000`):
   ```bash
   npm run dev:backend
   npm run dev:frontend
   ```

---

## 2. Pemisahan Environment (Development, Staging, Production) & Deployment Docker

| Parameter | Development | Staging | Production |
|---|---|---|---|
| **Database Driver** | `pglite` atau `pg` lokal | PostgreSQL 16 (`pg` Pool) | PostgreSQL 16 Primary + Read Replica + PgBouncer |
| **Redis Driver** | `memory` atau `ioredis` | Redis 7 (`ioredis`) | Redis 7 Sentinel / Cluster (`ioredis`) |
| **Reverse Proxy & TLS** | HTTP localhost | Nginx + TLS (Let's Encrypt Staging) | Nginx / Cloudflare / Cloud Load Balancer + TLS 1.3 + HSTS |
| **Isolasi Jaringan DB/Redis** | Localhost | Internal Docker network (`cbt_internal_net`) | Private VPC Subnet / Internal Docker Network (`internal: true`) |
| **Enkripsi Backup** | AES-256-GCM (Key dev) | AES-256-GCM (Key KMS staging) | AES-256-GCM (Key KMS / Vault produksi) |

### Menjalankan Stack Produksi dengan Docker Compose
```bash
docker compose up -d --build
```
- Layanan `postgres` dan `redis` berada di jaringan terisolasi `cbt_internal_net` (`internal: true`) dan **tidak** mengekspos port ke publik.
- Layanan `nginx` menjadi satu-satunya pintu masuk HTTP/HTTPS yang meneruskan `/api/*` ke `backend:4000` dan `/*` ke `frontend:3000`.

---

## 3. Estimasi Kebutuhan Infrastruktur & Biaya (500–750 Sesi Aktif Bersamaan)

### 3.1 Opsi A: Self-Hosted Server Sekolah (On-Premise)
- **Spesifikasi Minimum (Tanpa Kamera / Default)**:
  - CPU: 8 Core / 16 Thread (Intel Xeon / AMD EPYC / Ryzen Pro)
  - RAM: 16 GB ECC DDR4/DDR5
  - Penyimpanan: 256 GB NVMe SSD (RAID 1 disarankan)
  - Jaringan LAN/Wi-Fi: Access Point terkelola (Managed Wi-Fi 6) dengan pembagian maksimal 35–45 perangkat per Access Point, uplink Gigabit Ethernet ke server lokal.
- **Biaya Bulanan Operasional**: Rp 0 (biaya lisensi perangkat lunak Rp 0 karena 100% open-source).

### 3.2 Opsi B: Cloud VPS / Managed Cloud (Saat Periode Ujian)
- **Spesifikasi Cloud (500–750 Sesi Aktif, Kamera Nonaktif)**:
  - App Server (2x Instance atau 1x Dedicated 4 vCPU / 8 GB RAM): ~Rp 450.000 – Rp 750.000 / bulan (atau dihitung per jam selama minggu ujian ~Rp 150.000).
  - Managed PostgreSQL / Dedicated DB (2 vCPU / 4 GB RAM / NVMe): ~Rp 350.000 / bulan.
  - Object Storage (S3/MinIO/R2 untuk aset gambar soal & backup terenkripsi): ~Rp 25.000 / bulan.
- **Catatan Kapasitas Kamera**:
  - Jika fitur **Kamera Opsional** diaktifkan (mis. snapshot periodik setiap 60 detik dengan ukuran 40 KB/foto untuk 500 siswa), terdapat tambahan beban ingress ~330 KB/detik dan ~1,2 GB penyimpanan objek per jam ujian.

---

## 4. Panduan Konfigurasi Safe Exam Browser (SEB) & Matriks Perangkat BYOD

### 4.1 Matriks Kompatibilitas Jujur
| Sistem Operasi | Dukungan Resmi Safe Exam Browser (SEB) | Mode Standar yang Direkomendasikan |
|---|---|---|
| **Windows 10/11** | **Didukung Resmi** (SEB Windows Desktop) | `SECURE_BROWSER_REQUIRED` atau `SECURE_BROWSER_OPTIONAL` |
| **macOS 12+** | **Didukung Resmi** (SEB macOS) | `SECURE_BROWSER_REQUIRED` atau `SECURE_BROWSER_OPTIONAL` |
| **iPhone / iPad (iOS)** | **Didukung Resmi** (Aplikasi SEB di App Store) | `SECURE_BROWSER_OPTIONAL` atau `STANDARD_BROWSER` |
| **HP Android** | **TIDAK Didukung Resmi oleh SEB** | `STANDARD_BROWSER` (PWA Fullscreen + Deteksi Fokus/Tab/Visibilitas + Pengawasan Fisik Ruang) |

### 4.2 Cara Mengatur Kebijakan SEB di CBT PRO
1. Buka halaman **Pengaturan Keamanan** (`/admin/security-settings`) atau pengaturan pada **Paket Ujian** (`/exams`).
2. Pilih mode:
   - `STANDARD_BROWSER`: Mengizinkan browser modern di Android/iOS/Windows/macOS dengan pencatatan event anti-kecurangan penuh.
   - `SECURE_BROWSER_OPTIONAL`: Mengizinkan browser standar namun memberikan penanda verifikasi SEB pada dashboard proktor bagi perangkat yang memakai SEB.
   - `SECURE_BROWSER_REQUIRED`: Mewajibkan header/User-Agent SEB terverifikasi. Jika ada siswa pengguna Android pada sesi ini, **Proktor** dapat memberikan **Pengecualian Terotorisasi (`APPROVE_SEB_EXCEPTION`)** melalui Dashboard Proktor yang tercatat di Audit Log.

---

## 5. Panduan Penggunaan Berdasarkan Peran (Role)

### 5.1 Panduan Siswa (`/student/exams/...`)
1. Login menggunakan `username` dan `password` yang diberikan sekolah.
2. Pilih sesi ujian aktif, lalu jalankan **Pemeriksaan Perangkat** (`/student/exams/[sessionId]/device-check`).
3. Baca **Petunjuk & Tata Tertib** (`/student/exams/[sessionId]/instructions`) lalu klik **Mulai Ujian**.
4. Selama pengerjaan (`/student/exams/[sessionId]/take`):
   - Jawaban otomatis disimpan setiap kali memilih opsi atau mengetik jawaban.
   - Perhatikan badge status di kanan atas:
     - **Tersimpan di Server** (Hijau): Jawaban telah dikonfirmasi oleh database server.
     - **Tersimpan Lokal (Menunggu Sinkronisasi)** (Kuning/Biru): Koneksi sedang terputus, jawaban aman di perangkat (IndexedDB) dan akan otomatis dikirim saat sinyal kembali.
5. Jangan menutup tab atau berpindah aplikasi karena sistem mencatat durasi keluar tab (`TAB_HIDDEN` / `WINDOW_BLUR`).

### 5.2 Panduan Proktor (`/proctor/dashboard`) & Pengawas (`/supervisor/dashboard`)
- **Pengawas Ruang**:
  - Memverifikasi kehadiran fisik peserta di ruangan (`HADIR` / `ABSEN`).
  - Memantau indikator fokus layar dan mencatat laporan kejadian ruang yang diteruskan ke Proktor.
- **Proktor**:
  - Memantau ringkasan sesi real-time (jumlah peserta aktif, peserta offline, antrean sinkronisasi, dan kejadian keamanan).
  - Mengirim peringatan langsung (`PROCTOR_WARNING`) ke layar siswa.
  - Melakukan tindakan pemulihan terotorisasi: Reset Login Perangkat (`RESET_LOGIN`), Perpanjangan Waktu Darurat (`EXTEND_TIME_5M`), Pengecualian SEB BYOD (`APPROVE_SEB_EXCEPTION`), dan Persetujuan Pengawasan Fisik Pengganti Kamera (`APPROVE_CAMERA_ALTERNATIVE`).

---

## 6. SOP Penanganan Gangguan Koneksi & Eskalasi Insiden

### 6.1 SOP Gangguan Koneksi (Mode Offline Terbatas)
1. **Koneksi Terputus Singkat (< 120 detik / dalam `offline_grace_period_seconds`)**:
   - Siswa tetap dapat membaca soal yang sudah dimuat dan mengubah jawaban di halaman ujian.
   - Seluruh perubahan disimpan secara lokal di IndexedDB (`cbt_pro_offline_db`) dengan nomor urut (`client_sequence`) dan `idempotency_key`.
   - Begitu koneksi pulih, klien menjalankan sinkronisasi berurutan dengan *exponential backoff + jitter* ke endpoint `POST /api/v1/student/participants/:participantId/offline-sync`.
2. **Koneksi Terputus Melebihi Grace Period**:
   - Pengawas memastikan siswa tetap berada di tempat duduk dan tidak membuka sumber luar.
   - Setelah jaringan ruangan pulih, Proktor memeriksa status sinkronisasi peserta di `/proctor/dashboard` dan bila diperlukan memberikan tambahan waktu kompensasi (`EXTEND_TIME_5M`) yang tercatat di Audit Log.

### 6.2 SOP Eskalasi Insiden Keamanan
1. Sistem mengklasifikasikan event menjadi 4 level:
   - `INFORMATION`: Kejadian normal (mulai ujian, kumpul ujian, koneksi pulih).
   - `ATTENTION`: Keluar tab singkat (< 5 detik) atau gangguan koneksi singkat.
   - `REVIEW_REQUIRED`: Keluar tab berulang (>= 3 kali) atau durasi lama (>= 5 detik).
   - `SECURITY_INCIDENT`: Login ganda (`SESSION_DUPLICATE`), percobaan akses endpoint lintas hak akses (`UNAUTHORIZED_ACCESS`), atau pembatasan laju (`RATE_LIMIT_TRIGGERED`).
2. **Keputusan diskualifikasi atau pembatalan ujian TIDAK dilakukan secara otomatis oleh algoritma**; setiap `REVIEW_REQUIRED` dan `SECURITY_INCIDENT` wajib diverifikasi oleh Pengawas/Proktor dan dieskalasi ke Admin melalui log insiden (`/security-monitoring`).

---

## 7. Prosedur Backup, Restore & Retensi Data

### 7.1 Backup Terenkripsi (AES-256-GCM)
- Melalui CLI:
  ```bash
  npm run db:backup
  ```
- Melalui API Admin:
  ```http
  POST /api/v1/admin/backup
  ```
- Setiap berkas `.cbtbak` dienkripsi menggunakan **AES-256-GCM** (`IV 12-byte` + `AuthTag 16-byte`) dan diverifikasi dengan checksum **SHA-256**.

### 7.2 Uji Pemulihan (Restore) ke Database Bersih
- Melalui CLI:
  ```bash
  npm run db:restore -- ./backups/<nama-file>.cbtbak
  ```
- Prosedur ini telah diuji secara otomatis di `backend/test/stage5-6-7-8-security-offline-recovery.spec.ts` (menghapus data peserta dan memulihkannya kembali 100% utuh).

---

## 8. Kebijakan Privasi Kamera Opsional

1. **Nonaktif Secara Default**: Fitur kamera (`SNAPSHOT_PROCTORING`) berada dalam status **NONAKTIF** secara bawaan pada seluruh sesi ujian.
2. **Pemberitahuan & Persetujuan Eksplisit**: Jika sekolah mengaktifkan kamera pada sesi tertentu, halaman petunjuk ujian menampilkan pemberitahuan privasi transparan dan meminta persetujuan siswa (`cameraConsentGranted`).
3. **Alternatif Tanpa Diskriminasi Perangkat**: Siswa dengan perangkat tanpa kamera atau kamera rusak tetap berhak mengikuti ujian melalui mekanisme **Persetujuan Pengawasan Fisik Ruang (`APPROVE_CAMERA_ALTERNATIVE`)** oleh Proktor.
4. **Minimisasi & Audit Akses**: Sistem tidak melakukan perekaman video kontinu tanpa batas. Setiap peninjauan log kamera oleh Proktor/Admin wajib menyertakan alasan dan dicatat secara permanen di tabel `camera_access_audit_logs`.
5. **Retensi Terbatas**: Metadata dan snapshot kamera dihapus otomatis setelah masa retensi kebijakan sekolah berakhir (default: **14 hari** setelah nilai dipublikasikan).
