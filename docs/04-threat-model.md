# 04 — Threat Model, Anti-Kecurangan & Batasan Keamanan

## 1. Threat Model (STRIDE & Konteks Ujian Sekolah BYOD)

| Ancaman | Vektor Serangan | Mitigasi Teknis di CBT PRO |
| :--- | :--- | :--- |
| **Kebocoran Kunci Jawaban** | Siswa memeriksa response JSON di DevTools Network / IndexedDB | Backend memiliki serializer khusus siswa yang menghapus `answer_key`, `is_correct`, dan `explanation_html` sebelum payload keluar dari server. |
| **Manipulasi Jam Klien (Time Tampering)** | Siswa memundurkan jam HP/laptop untuk menambah waktu ujian | Waktu mulai (`started_at`) dan batas akhir (`server_deadline_at`) dihitung serta divalidasi murni menggunakan jam UTC server. Jawaban setelah `server_deadline_at` (ditambah toleransi sinkronisasi resmi jika ada) ditolak (`409 Conflict` / `403 Forbidden`). |
| **Pengumpulan / Penilaian Ganda (Race Condition)** | Siswa atau jaringan mengirim request `/submit` berkali-kali secara paralel | Constraint `UNIQUE (exam_participant_id)` dan `UNIQUE (idempotency_key)` pada `exam_submissions` + penguncian baris transaksi `SELECT ... FOR UPDATE` memastikan request ulang mengembalikan hasil submission pertama secara idempoten. |
| **Sesi Ganda (Simultaneous Login / Joki)** | Akun siswa dibuka di dua perangkat sekaligus | Setiap sesi ujian aktif mengikat `active_session_fingerprint` / token sesi unik. Pembukaan sesi baru memicu event `SESSION_DUPLICATE` (`REVIEW_REQUIRED` / `SECURITY_INCIDENT`) dan mencabut token sesi lama atau meminta otorisasi pemulihan proktor. |
| **IDOR (Membaca/Mengubah Jawaban Siswa Lain)** | Mengganti `participantId` pada payload API `/answers` atau `/events` | Identitas peserta selalu diambil dari token sesi terverifikasi (`req.user.id`) dan diverifikasi terhadap kepemilikan `exam_participant_id`. |
| **Manipulasi Buffer Offline (IndexedDB)** | Siswa memodifikasi timestamp lokal atau menyuntikkan jawaban setelah ujian berakhir | Server tidak memercayai klaim jam lokal sebagai bukti keabsahan waktu ujian. Seluruh item sinkronisasi offline divalidasi terhadap status sesi server, `offline_grace_period_seconds`, skema Zod/DTO, dan versi jawaban (`answer_version`). |
| **Brute-Force & Flood Request** | Serangan tebak password atau membanjiri endpoint autosave/event | Hashing Argon2id + akun terkunci sementara setelah percobaan gagal beruntun + Rate Limiting per user/endpoint dengan pencatatan event `RATE_LIMIT_TRIGGERED`. |
| **Penyalahgunaan Wewenang Pengawas/Guru** | Pengawas mencoba mengubah nilai atau guru mengakses kelas lain | Guard RBAC + Object-Level Authorization menolak akses (`403 Forbidden`) dan mencatat event `UNAUTHORIZED_ACCESS` ke `audit_logs` & `anti_cheating_events`. |

## 2. Enam Belas Jenis Event Anti-Kecurangan & Klasifikasi Proporsional

| Jenis Event (`event_type`) | Klasifikasi Default | Penjelasan & Kebijakan Non-Tuduhan Otomatis |
| :--- | :--- | :--- |
| `TAB_HIDDEN` | `ATTENTION` (atau `REVIEW_REQUIRED` jika berulang/lama) | Terdeteksi melalui `visibilitychange`. Mencatat durasi (`duration_ms`). Tidak otomatis mendiskualifikasi siswa karena bisa dipicu notifikasi sistem HP. |
| `WINDOW_BLUR` | `ATTENTION` | Jendela browser kehilangan fokus. Dicatat untuk ditinjau proktor/pengawas. |
| `SESSION_DUPLICATE` | `REVIEW_REQUIRED` | Percobaan akses sesi ujian dari perangkat/tab/token berbeda saat sesi sedang aktif. |
| `INVALID_SESSION` | `REVIEW_REQUIRED` | Penggunaan token sesi yang sudah dicabut atau tidak cocok dengan sesi aktif. |
| `RATE_LIMIT_TRIGGERED` | `ATTENTION` | Frekuensi request melewati batas wajar pada periode singkat. |
| `UNAUTHORIZED_ACCESS` | `SECURITY_INCIDENT` | Percobaan mengakses endpoint/objek di luar hak akses role atau kepemilikan sesi. |
| `CONNECTION_INTERRUPTED` | `INFORMATION` | Koneksi terputus; bukan bukti kecurangan, digunakan untuk audit ketahanan jaringan. |
| `CONNECTION_RESTORED` | `INFORMATION` | Koneksi kembali pulih beserta durasi terputus. |
| `OFFLINE_BUFFER_CREATED` | `INFORMATION` | Jawaban disimpan di buffer lokal IndexedDB saat offline. |
| `OFFLINE_SYNC_COMPLETED` | `INFORMATION` | Antrean jawaban offline berhasil disinkronisasi ke server. |
| `OFFLINE_SYNC_CONFLICT` | `REVIEW_REQUIRED` | Terjadi perbedaan versi jawaban antara buffer lokal dan server; diselesaikan sesuai kebijakan konflik tanpa menghapus jejak di `answer_events`. |
| `CAMERA_UNAVAILABLE` | `ATTENTION` | Kamera tidak tersedia atau izin ditolak pada ujian yang mengaktifkan kamera opsional. |
| `EXAM_RESUMED` | `INFORMATION` | Sesi ujian dilanjutkan kembali (baik otomatis saat reconnect dalam grace period maupun melalui pemulihan proktor). |
| `EXAM_SUBMITTED` | `INFORMATION` | Peserta menyelesaikan dan mengumpulkan ujian. |
| `PROCTOR_WARNING` | `ATTENTION` | Peringatan resmi yang dikirim oleh proktor kepada peserta. |
| `PROCTOR_INTERVENTION` | `REVIEW_REQUIRED` | Tindakan intervensi proktor (mis. reset sesi, perpanjangan waktu darurat, pengecualian SEB tercatat). |

## 3. Batasan Jujur Browser Standar & Mode Offline
- **Browser Standar**: Browser web biasa (Chrome, Safari, Firefox, Edge) berjalan di dalam sandbox sistem operasi dan **tidak dapat** memantau aplikasi lain yang berjalan di luar browser, tidak dapat memblokir tangkapan layar tingkat OS, dan tidak dapat mengunci perangkat sepenuhnya.
- **Perubahan Alamat IP**: Pergantian IP (mis. perpindahan Wi-Fi sekolah ke data seluler saat sinyal lemah) **bukan** bukti kecurangan dan tidak digunakan sebagai satu-satunya identitas perangkat.
- **Mode Offline**: Mode offline dirancang murni sebagai **mekanisme ketahanan terhadap gangguan koneksi sementara**, bukan jaminan keamanan setara ujian online terawasi.
