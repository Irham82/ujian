# 03 — Matriks Hak Akses (RBAC & Object-Level Authorization)

Seluruh kontrol akses divalidasi di **backend** menggunakan kombinasi **Role-Based Access Control (RBAC)** dan **Object-Level Authorization (OLA)** (memeriksa kepemilikan kelas, bank soal, sesi ruang ujian, dan partisipasi siswa).

## 1. Tabel Matriks Kewenangan 5 Role

| Kapabilitas / Domain | ADMIN | TEACHER (Guru) | PROCTOR (Proktor) | SUPERVISOR (Pengawas) | STUDENT (Siswa) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| Kelola pengguna, role, tahun ajaran, kelas, mapel, konfigurasi sekolah | **PENUH** | Tidak | Tidak | Tidak | Tidak |
| Kelola backup, restore, retensi data, pengaturan sistem, notifikasi sekolah | **PENUH** | Tidak | Tidak | Tidak | Tidak |
| Buat & kelola bank soal, soal (PG/PGK/BS/Isian/Esai), kunci jawaban, bobot, pembahasan | **PENUH** | **PENUH (Mapel/Bank miliknya)** | Tidak | **DILARANG** | **DILARANG KERAS** |
| Buat paket ujian, atur pengacakan soal & opsi | **PENUH** | **PENUH (Mapel miliknya)** | Tidak | Tidak | Tidak |
| Buat jadwal & sesi ujian, tetapkan proktor & pengawas | **PENUH** | Lihat jadwal mapelnya | Lihat sesi tugasnya | Lihat sesi tugasnya | Lihat jadwal kelasnya |
| Atur mode keamanan (SEB), kamera opsional, & offline grace period | **PENUH** | Usul pada paket ujian | Pengecualian tercatat saat insiden | **DILARANG** | Tidak |
| Mulai/lanjutkan sesi ujian, jawab soal, tandai ragu-ragu, kumpulkan jawaban | Tidak | Simulasi pratinjau (bukan sesi siswa) | Tidak | Tidak | **HANYA SESI MILIKNYA YANG AKTIF** |
| Baca kunci jawaban & pembahasan saat ujian berlangsung | **PENUH** | **Hanya Bank Soal miliknya** | **DILARANG** | **DILARANG** | **DILARANG KERAS** |
| Pantau status koneksi, sinkronisasi, dan kejadian keamanan real-time | **PENUH** | Tidak | **Sesi yang ditugaskan** | **Peserta di ruang tugasnya** | Status dirinya sendiri |
| Catat kehadiran (presensi) & tambah laporan insiden/keterangan | **PENUH** | Tidak | **Sesi yang ditugaskan** | **Peserta di ruang tugasnya** | Tidak |
| Beri peringatan proktor, bantu pemulihan sesi, setujui pengecualian terotorisasi, eskalasi ke Admin | **PENUH** | Tidak | **Sesi yang ditugaskan** | Tidak (Hanya lapor ke Proktor) | Tidak |
| Koreksi manual esai & ubah nilai esai | **PENUH** | **Hanya kelas/ujian yang ditugaskan** | Tidak | **DILARANG** | **DILARANG** |
| Lihat hasil ujian, rekap nilai, & analisis butir soal | **PENUH** | **Hanya kelas yang ditugaskan** | Tidak | Tidak | **Hanya nilai dirinya jika dipublikasikan** |
| Lihat & ekspor Audit Log | **PENUH** | Tidak | Hanya log sesi tugasnya | **DILARANG MENGHAPUS/UBAH** | Tidak |

## 2. Aturan Object-Level Authorization (Pencegahan IDOR)
1. **Siswa (`STUDENT`)**:
   - Hanya dapat membaca soal dari `exam_participants` yang berstatus `IN_PROGRESS` dan `student_user_id === currentUser.id`.
   - Tidak pernah menerima field `answer_key`, `is_correct`, atau `explanation_html` dari endpoint soal ujian.
   - Tidak dapat membaca atau mengirim jawaban atas nama `exam_participant_id` milik siswa lain.
2. **Guru (`TEACHER`)**:
   - Hanya dapat mengakses/mengedit bank soal, paket ujian, penilaian esai, dan laporan hasil untuk kelas/mata pelajaran yang ditugaskan kepadanya (`class_memberships` / `question_banks.owner_teacher_id` / `exams.created_by`).
3. **Proktor (`PROCTOR`)**:
   - Hanya dapat memantau, memberi peringatan, atau memulihkan sesi pada `exam_session_id` yang terdaftar di `exam_proctors` untuk dirinya.
4. **Pengawas (`SUPERVISOR`)**:
   - Hanya dapat melihat peserta, mencatat kehadiran, dan membuat laporan kejadian pada `exam_session_id` (dan `room_id`) yang terdaftar di `exam_supervisors` untuk dirinya.
   - Ditolak (`403 Forbidden`) bila mencoba mengakses kunci jawaban, mengubah soal, mengubah nilai, menghapus audit log, atau mengubah konfigurasi keamanan.
