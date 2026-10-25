# 07 — Rencana Pengujian Fungsional, Keamanan, Offline, Pemulihan & Load Test 500+ Sesi

## 1. Matriks Pengujian Wajib

### 1.1 Pengujian Fungsi (Functional & Integration Tests)
1. Login untuk 5 role (`ADMIN`, `TEACHER`, `PROCTOR`, `SUPERVISOR`, `STUDENT`).
2. Pembuatan bank soal (5 tipe soal), paket ujian, dan jadwal sesi ujian.
3. Penetapan peserta (melalui kelas/rombel), proktor, dan pengawas.
4. Pemeriksaan perangkat, mulai pengerjaan soal, dan pengacakan soal/opsi deterministik.
5. Autosave jawaban dengan `idempotency_key` dan versi jawaban.
6. Penegakan timer server (UTC) dan penolakan jawaban saat waktu habis.
7. Pengumpulan akhir (`submit`) yang idempoten.
8. Koreksi otomatis (PG, PG Kompleks, Benar-Salah, Isian Singkat) yang terikat versi soal.
9. Penilaian manual soal Esai oleh Guru dan perhitungan ulang nilai total.
10. Rekap laporan, analisis butir soal, dan ekspor data.

### 1.2 Pengujian Keamanan (11 Skenario Wajib)
1. Siswa mencoba mengakses kunci jawaban melalui API soal/ujian (`answer_key` tidak boleh ada di response).
2. Siswa mencoba membaca atau mengubah jawaban peserta lain (IDOR -> `403 Forbidden`).
3. Guru mencoba mengakses/menilai kelas atau bank soal yang tidak ditugaskan (`403 Forbidden`).
4. Pengawas mencoba mengubah nilai, mengubah soal, atau menghapus audit log (`403 Forbidden`).
5. Proktor mencoba mengakses sesi ujian di luar penugasannya (`403 Forbidden`).
6. Penggunaan token yang sudah kedaluwarsa atau telah di-logout (`401 Unauthorized`).
7. Deteksi sesi ganda (`SESSION_DUPLICATE`) ketika siswa login dari perangkat kedua saat ujian aktif.
8. Pemicuan rate limiting (`429 Too Many Requests` + pencatatan `RATE_LIMIT_TRIGGERED`).
9. Pengumpulan akhir berulang / paralel (tidak boleh menghasilkan 2 baris `exam_submissions` atau penilaian ganda).
10. Manipulasi waktu klien (mengirim `clientUpdatedAt` palsu setelah `server_deadline_at` -> ditolak server).
11. Percobaan akses endpoint administratif tanpa izin (`403 Forbidden` + tercatat di `audit_logs` & `anti_cheating_events`).

### 1.3 Pengujian Mode Offline Terbatas (11 Skenario Wajib)
1. Koneksi terputus setelah jawaban diubah.
2. Buffer lokal bertambah dan ditandai sebagai "Tersimpan Lokal (Menunggu Sinkronisasi)".
3. Browser dimuat ulang saat offline (jawaban dipulihkan dari IndexedDB).
4. Koneksi kembali pulih dan verifikasi sesi dijalankan.
5. Sinkronisasi antrean offline berhasil secara berurutan.
6. Retry berulang dengan idempotency key yang sama tidak menggandakan event atau merusak jawaban.
7. Konflik versi jawaban ditangani sesuai kebijakan tanpa menghapus riwayat di `answer_events`.
8. Batas waktu toleransi offline (`offline_grace_period_seconds`) tercapai -> memerlukan/mencatat status review.
9. Ujian berakhir (`server_deadline_at` terlewati) ketika perangkat sedang offline.
10. Sesi dicabut oleh proktor saat perangkat sedang offline -> sinkronisasi ditolak dengan status jelas.
11. Server menolak jawaban tidak sah (soal di luar paket ujian atau sesi sudah `SUBMITTED`).

### 1.4 Pengujian Pemulihan (Recovery Tests)
1. Backup database PostgreSQL ke snapshot terenkripsi/terstruktur.
2. Restore database dan verifikasi integritas seluruh jawaban serta submission.
3. Pemulihan sesi peserta oleh proktor saat perangkat siswa berganti/crash.
4. Pemulihan antrean sinkronisasi dan kelangsungan sesi saat aplikasi backend direstart di tengah ujian aktif.

## 2. Rencana Load Test 500+ Sesi (16 Skenario Grafana k6 & Concurrent Runner)
Target performa pada lingkungan uji:
- **500 sesi ujian aktif bersamaan** (serta uji ketahanan 750 pengguna).
- **Endpoint baca soal (`GET /paper`)**: target **p95 < 500 ms**.
- **Endpoint simpan jawaban (`PUT /answers`)**: target **p95 < 500 ms**.
- **Error rate**: **< 0,1%** untuk request valid.
- **Integritas data**: **0 jawaban terkonfirmasi server yang hilang**, **0 submission ganda**.

Enam belas skenario yang disiapkan di `load-tests/k6/`:
1. Smoke test (5 VUs).
2. Ramp-up 50 pengguna.
3. Uji 100 pengguna aktif.
4. Uji 250 pengguna aktif.
5. Uji 500 pengguna aktif bersamaan.
6. Uji stress 750 pengguna.
7. Lonjakan login serentak (*Login Spike*).
8. Navigasi & pembacaan naskah soal intensif.
9. Autosave jawaban konkuren.
10. Pengumpulan akhir (*Submit*) serentak.
11. Simulasi gangguan koneksi massal.
12. Reconnect serentak (*Thundering Herd Reconnect*).
13. Sinkronisasi batch antrean offline serentak.
14. Lonjakan event anti-kecurangan (*Anti-Cheat Event Burst*).
15. Sesi panjang (*Soak / Endurance Test*).
16. Uji degradasi / failover instance aplikasi.
