import { DatabaseService } from './database.service';
import { hashPassword } from '../common/crypto.util';

export const SEED_IDS = {
  SCHOOL_ID: '10000000-0000-4000-8000-000000000001',
  ACADEMIC_YEAR_ID: '10000000-0000-4000-8000-000000000002',
  ROLE_ADMIN_ID: '10000000-0000-4000-8000-000000000011',
  ROLE_TEACHER_ID: '10000000-0000-4000-8000-000000000012',
  ROLE_PROCTOR_ID: '10000000-0000-4000-8000-000000000013',
  ROLE_SUPERVISOR_ID: '10000000-0000-4000-8000-000000000014',
  ROLE_STUDENT_ID: '10000000-0000-4000-8000-000000000015',

  USER_ADMIN_ID: '20000000-0000-4000-8000-000000000001',
  USER_TEACHER_1_ID: '20000000-0000-4000-8000-000000000002',
  USER_TEACHER_2_ID: '20000000-0000-4000-8000-000000000003',
  USER_PROCTOR_1_ID: '20000000-0000-4000-8000-000000000004',
  USER_PROCTOR_2_ID: '20000000-0000-4000-8000-000000000005',
  USER_SUPERVISOR_1_ID: '20000000-0000-4000-8000-000000000006',
  USER_SUPERVISOR_2_ID: '20000000-0000-4000-8000-000000000007',
  USER_STUDENT_1_ID: '20000000-0000-4000-8000-000000000011',
  USER_STUDENT_2_ID: '20000000-0000-4000-8000-000000000012',
  USER_STUDENT_3_ID: '20000000-0000-4000-8000-000000000013',

  CLASS_XII_IPA_1_ID: '30000000-0000-4000-8000-000000000001',
  CLASS_XII_IPA_2_ID: '30000000-0000-4000-8000-000000000002',
  SUBJECT_MATEMATIKA_ID: '40000000-0000-4000-8000-000000000001',
  SUBJECT_FISIKA_ID: '40000000-0000-4000-8000-000000000002',
  ROOM_LAB_1_ID: '50000000-0000-4000-8000-000000000001',
  ROOM_LAB_2_ID: '50000000-0000-4000-8000-000000000002',

  BANK_TKA_MATEMATIKA_ID: '60000000-0000-4000-8000-000000000001',
  BANK_TKA_FISIKA_ID: '60000000-0000-4000-8000-000000000002',

  Q1_SINGLE_CHOICE_ID: '70000000-0000-4000-8000-000000000001',
  Q2_COMPLEX_CHOICE_ID: '70000000-0000-4000-8000-000000000002',
  Q3_TRUE_FALSE_ID: '70000000-0000-4000-8000-000000000003',
  Q4_SHORT_ANSWER_ID: '70000000-0000-4000-8000-000000000004',
  Q5_ESSAY_ID: '70000000-0000-4000-8000-000000000005',

  EXAM_TKA_UTAMA_ID: '80000000-0000-4000-8000-000000000001',
  SESSION_LAB_1_ID: '90000000-0000-4000-8000-000000000001',
  SESSION_LAB_2_ID: '90000000-0000-4000-8000-000000000002',

  PARTICIPANT_STUDENT_1_ID: 'a0000000-0000-4000-8000-000000000001',
  PARTICIPANT_STUDENT_2_ID: 'a0000000-0000-4000-8000-000000000002',
  PARTICIPANT_STUDENT_3_ID: 'a0000000-0000-4000-8000-000000000003',
};

export async function runDevelopmentSeed(db: DatabaseService): Promise<void> {
  await db.runMigrations();
  const defaultPasswordHash = await hashPassword('CbtPro#2026');

  await db.withTransaction(async (tx) => {
    // 1. School
    await tx.query(
      `INSERT INTO schools (id, code, name, timezone, address)
       VALUES ($1, 'SMAN1-MKS', 'SMA Negeri 1 Unggulan Nusantara', 'Asia/Makassar', 'Jl. Pendidikan No. 1, Makassar')
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, timezone = EXCLUDED.timezone`,
      [SEED_IDS.SCHOOL_ID],
    );

    // 2. Academic Year
    await tx.query(
      `INSERT INTO academic_years (id, school_id, name, semester, is_active, start_date, end_date)
       VALUES ($1, $2, '2026/2027', 'GANJIL', TRUE, '2026-07-01', '2026-12-31')
       ON CONFLICT (id) DO NOTHING`,
      [SEED_IDS.ACADEMIC_YEAR_ID, SEED_IDS.SCHOOL_ID],
    );

    // 3. Roles
    const roles = [
      { id: SEED_IDS.ROLE_ADMIN_ID, code: 'ADMIN', name: 'Administrator Sistem Sekolah' },
      { id: SEED_IDS.ROLE_TEACHER_ID, code: 'TEACHER', name: 'Guru Mata Pelajaran' },
      { id: SEED_IDS.ROLE_PROCTOR_ID, code: 'PROCTOR', name: 'Proktor Ujian' },
      { id: SEED_IDS.ROLE_SUPERVISOR_ID, code: 'SUPERVISOR', name: 'Pengawas Ruang' },
      { id: SEED_IDS.ROLE_STUDENT_ID, code: 'STUDENT', name: 'Siswa Peserta Ujian' },
    ];
    for (const r of roles) {
      await tx.query(
        `INSERT INTO roles (id, code, name) VALUES ($1, $2, $3) ON CONFLICT (code) DO NOTHING`,
        [r.id, r.code, r.name],
      );
    }

    // 4. Users & User Roles
    const users = [
      {
        id: SEED_IDS.USER_ADMIN_ID,
        username: 'admin',
        email: 'admin@sekolah.sch.id',
        fullName: 'Dr. Hendra Wijaya (Admin)',
        code: 'NIP-19800101',
        roleId: SEED_IDS.ROLE_ADMIN_ID,
        userRoleId: '21000000-0000-4000-8000-000000000001',
      },
      {
        id: SEED_IDS.USER_TEACHER_1_ID,
        username: 'guru.matematika',
        email: 'guru.mtk@sekolah.sch.id',
        fullName: 'Ratna Sari, S.Pd., M.Pd.',
        code: 'NIP-19850202',
        roleId: SEED_IDS.ROLE_TEACHER_ID,
        userRoleId: '21000000-0000-4000-8000-000000000002',
      },
      {
        id: SEED_IDS.USER_TEACHER_2_ID,
        username: 'guru.fisika',
        email: 'guru.fis@sekolah.sch.id',
        fullName: 'Budi Santoso, M.Si.',
        code: 'NIP-19860303',
        roleId: SEED_IDS.ROLE_TEACHER_ID,
        userRoleId: '21000000-0000-4000-8000-000000000003',
      },
      {
        id: SEED_IDS.USER_PROCTOR_1_ID,
        username: 'proktor.utama',
        email: 'proktor1@sekolah.sch.id',
        fullName: 'Arif Rahman, S.Kom. (Proktor Lab 1)',
        code: 'NIP-19900404',
        roleId: SEED_IDS.ROLE_PROCTOR_ID,
        userRoleId: '21000000-0000-4000-8000-000000000004',
      },
      {
        id: SEED_IDS.USER_PROCTOR_2_ID,
        username: 'proktor.kedua',
        email: 'proktor2@sekolah.sch.id',
        fullName: 'Dian Pratama, S.T. (Proktor Lab 2)',
        code: 'NIP-19910505',
        roleId: SEED_IDS.ROLE_PROCTOR_ID,
        userRoleId: '21000000-0000-4000-8000-000000000005',
      },
      {
        id: SEED_IDS.USER_SUPERVISOR_1_ID,
        username: 'pengawas.ruang1',
        email: 'pengawas1@sekolah.sch.id',
        fullName: 'Siti Aminah, S.Pd. (Pengawas Ruang 1)',
        code: 'NIP-19920606',
        roleId: SEED_IDS.ROLE_SUPERVISOR_ID,
        userRoleId: '21000000-0000-4000-8000-000000000006',
      },
      {
        id: SEED_IDS.USER_SUPERVISOR_2_ID,
        username: 'pengawas.ruang2',
        email: 'pengawas2@sekolah.sch.id',
        fullName: 'Lukman Hakim, S.Pd. (Pengawas Ruang 2)',
        code: 'NIP-19930707',
        roleId: SEED_IDS.ROLE_SUPERVISOR_ID,
        userRoleId: '21000000-0000-4000-8000-000000000007',
      },
      {
        id: SEED_IDS.USER_STUDENT_1_ID,
        username: 'siswa.andi',
        email: 'andi.pratama@siswa.sch.id',
        fullName: 'Andi Pratama Putra',
        code: 'NISN-0081112221',
        roleId: SEED_IDS.ROLE_STUDENT_ID,
        userRoleId: '21000000-0000-4000-8000-000000000011',
      },
      {
        id: SEED_IDS.USER_STUDENT_2_ID,
        username: 'siswa.nadia',
        email: 'nadia.putri@siswa.sch.id',
        fullName: 'Nadia Putri Maharani',
        code: 'NISN-0081112222',
        roleId: SEED_IDS.ROLE_STUDENT_ID,
        userRoleId: '21000000-0000-4000-8000-000000000012',
      },
      {
        id: SEED_IDS.USER_STUDENT_3_ID,
        username: 'siswa.rizky',
        email: 'rizky.ramadhan@siswa.sch.id',
        fullName: 'Rizky Ramadhan',
        code: 'NISN-0081112223',
        roleId: SEED_IDS.ROLE_STUDENT_ID,
        userRoleId: '21000000-0000-4000-8000-000000000013',
      },
    ];

    for (const u of users) {
      await tx.query(
        `INSERT INTO users (id, school_id, username, email, full_name, identifier_code, password_hash, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
         ON CONFLICT (id) DO NOTHING`,
        [u.id, SEED_IDS.SCHOOL_ID, u.username, u.email, u.fullName, u.code, defaultPasswordHash],
      );
      await tx.query(
        `INSERT INTO user_roles (id, user_id, role_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, role_id) DO NOTHING`,
        [u.userRoleId, u.id, u.roleId],
      );
    }

    // 5. Classes & Memberships
    await tx.query(
      `INSERT INTO classes (id, school_id, academic_year_id, name, grade_level, homeroom_teacher_id)
       VALUES
         ($1, $3, $4, 'XII MIPA 1', 'XII', $5),
         ($2, $3, $4, 'XII MIPA 2', 'XII', $6)
       ON CONFLICT (id) DO NOTHING`,
      [
        SEED_IDS.CLASS_XII_IPA_1_ID,
        SEED_IDS.CLASS_XII_IPA_2_ID,
        SEED_IDS.SCHOOL_ID,
        SEED_IDS.ACADEMIC_YEAR_ID,
        SEED_IDS.USER_TEACHER_1_ID,
        SEED_IDS.USER_TEACHER_2_ID,
      ],
    );

    const memberships = [
      { id: '31000000-0000-4000-8000-000000000001', classId: SEED_IDS.CLASS_XII_IPA_1_ID, userId: SEED_IDS.USER_TEACHER_1_ID, role: 'TEACHER' },
      { id: '31000000-0000-4000-8000-000000000002', classId: SEED_IDS.CLASS_XII_IPA_1_ID, userId: SEED_IDS.USER_STUDENT_1_ID, role: 'STUDENT' },
      { id: '31000000-0000-4000-8000-000000000003', classId: SEED_IDS.CLASS_XII_IPA_1_ID, userId: SEED_IDS.USER_STUDENT_2_ID, role: 'STUDENT' },
      { id: '31000000-0000-4000-8000-000000000004', classId: SEED_IDS.CLASS_XII_IPA_2_ID, userId: SEED_IDS.USER_TEACHER_2_ID, role: 'TEACHER' },
      { id: '31000000-0000-4000-8000-000000000005', classId: SEED_IDS.CLASS_XII_IPA_2_ID, userId: SEED_IDS.USER_STUDENT_3_ID, role: 'STUDENT' },
    ];
    for (const m of memberships) {
      await tx.query(
        `INSERT INTO class_memberships (id, class_id, user_id, membership_role)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (class_id, user_id, membership_role) DO NOTHING`,
        [m.id, m.classId, m.userId, m.role],
      );
    }

    // 6. Subjects & Rooms
    await tx.query(
      `INSERT INTO subjects (id, school_id, code, name, description)
       VALUES
         ($1, $3, 'MTK-TKA', 'Matematika Penalaran & TKA', 'Tes Kompetensi Akademik Matematika SMA'),
         ($2, $3, 'FIS-TKA', 'Fisika Saintek & TKA', 'Tes Kompetensi Akademik Fisika SMA')
       ON CONFLICT (id) DO NOTHING`,
      [SEED_IDS.SUBJECT_MATEMATIKA_ID, SEED_IDS.SUBJECT_FISIKA_ID, SEED_IDS.SCHOOL_ID],
    );

    await tx.query(
      `INSERT INTO rooms (id, school_id, code, name, capacity, location)
       VALUES
         ($1, $3, 'LAB-CBT-01', 'Laboratorium Komputer 1', 40, 'Gedung Utama Lt. 2'),
         ($2, $3, 'LAB-CBT-02', 'Laboratorium Komputer 2 & BYOD', 40, 'Gedung Utama Lt. 2')
       ON CONFLICT (id) DO NOTHING`,
      [SEED_IDS.ROOM_LAB_1_ID, SEED_IDS.ROOM_LAB_2_ID, SEED_IDS.SCHOOL_ID],
    );

    // 7. Question Banks
    await tx.query(
      `INSERT INTO question_banks (id, school_id, subject_id, owner_teacher_id, title, description, is_shared)
       VALUES
         ($1, $3, $4, $6, 'Bank Soal TKA Matematika 2026', 'Kumpulan soal penalaran kuantitatif & aljabar terstandar TKA', FALSE),
         ($2, $3, $5, $7, 'Bank Soal TKA Fisika 2026', 'Kumpulan soal mekanika & elektromagnetika TKA', FALSE)
       ON CONFLICT (id) DO NOTHING`,
      [
        SEED_IDS.BANK_TKA_MATEMATIKA_ID,
        SEED_IDS.BANK_TKA_FISIKA_ID,
        SEED_IDS.SCHOOL_ID,
        SEED_IDS.SUBJECT_MATEMATIKA_ID,
        SEED_IDS.SUBJECT_FISIKA_ID,
        SEED_IDS.USER_TEACHER_1_ID,
        SEED_IDS.USER_TEACHER_2_ID,
      ],
    );

    // 8. Five Question Types in Bank Soal TKA Matematika
    const questions = [
      {
        id: SEED_IDS.Q1_SINGLE_CHOICE_ID,
        type: 'SINGLE_CHOICE',
        difficulty: 'MEDIUM',
        category: 'ALJABAR & FUNGSI',
        stem: '<p>Jika fungsi kuadrat <em>f(x) = 2x² - 8x + 11</em> memiliki nilai minimum pada titik puncak <em>(p, q)</em>, maka nilai dari <strong>p + q</strong> adalah ...</p>',
        formula: 'f(x) = 2x^2 - 8x + 11',
        weight: 20,
        answerKey: { selectedOption: 'C' },
        explanation: 'Sumbu simetri p = -(-8)/(2*2) = 2. Nilai minimum q = 2(2)^2 - 8(2) + 11 = 3. Maka p + q = 2 + 3 = 5.',
        options: [
          { id: '71000000-0000-4000-8000-000000000001', key: 'A', html: '3', isCorrect: false, order: 1 },
          { id: '71000000-0000-4000-8000-000000000002', key: 'B', html: '4', isCorrect: false, order: 2 },
          { id: '71000000-0000-4000-8000-000000000003', key: 'C', html: '5', isCorrect: true, order: 3 },
          { id: '71000000-0000-4000-8000-000000000004', key: 'D', html: '6', isCorrect: false, order: 4 },
          { id: '71000000-0000-4000-8000-000000000005', key: 'E', html: '7', isCorrect: false, order: 5 },
        ],
      },
      {
        id: SEED_IDS.Q2_COMPLEX_CHOICE_ID,
        type: 'MULTIPLE_CHOICE_COMPLEX',
        difficulty: 'HARD',
        category: 'STATISTIKA & PELUANG',
        stem: '<p>Perhatikan data nilai latihan TKA lima siswa: <strong>70, 75, 80, 85, 90</strong>. Pilihlah <strong>semua pernyataan yang benar</strong> di bawah ini!</p>',
        formula: '\\bar{x} = \\frac{\\sum x_i}{n}',
        weight: 20,
        answerKey: { selectedOptions: ['A', 'C'] },
        explanation: 'Rata-rata = 80 (A benar). Median = 80 (B salah). Jangkauan = 90 - 70 = 20 (C benar).',
        options: [
          { id: '71000000-0000-4000-8000-000000000006', key: 'A', html: 'Rata-rata (mean) data tersebut adalah 80', isCorrect: true, order: 1 },
          { id: '71000000-0000-4000-8000-000000000007', key: 'B', html: 'Median data tersebut adalah 75', isCorrect: false, order: 2 },
          { id: '71000000-0000-4000-8000-000000000008', key: 'C', html: 'Jangkauan (range) data tersebut adalah 20', isCorrect: true, order: 3 },
          { id: '71000000-0000-4000-8000-000000000009', key: 'D', html: 'Simpangan baku data tersebut adalah 0', isCorrect: false, order: 4 },
        ],
      },
      {
        id: SEED_IDS.Q3_TRUE_FALSE_ID,
        type: 'TRUE_FALSE',
        difficulty: 'EASY',
        category: 'LOGIKA MATEMATIKA',
        stem: '<p>Bilangan prima genap satu-satunya di himpunan bilangan asli adalah <strong>2</strong>.</p>',
        formula: null,
        weight: 20,
        answerKey: { value: true, selectedOption: 'TRUE' },
        explanation: '2 hanya habis dibagi 1 dan dirinya sendiri serta merupakan bilangan genap.',
        options: [
          { id: '71000000-0000-4000-8000-000000000010', key: 'TRUE', html: 'Benar', isCorrect: true, order: 1 },
          { id: '71000000-0000-4000-8000-000000000011', key: 'FALSE', html: 'Salah', isCorrect: false, order: 2 },
        ],
      },
      {
        id: SEED_IDS.Q4_SHORT_ANSWER_ID,
        type: 'SHORT_ANSWER',
        difficulty: 'MEDIUM',
        category: 'ARITMETIKA',
        stem: '<p>Berapakah nilai dari <strong>15% dari 200</strong>? (Tuliskan angka saja)</p>',
        formula: '0.15 \\times 200',
        weight: 20,
        answerKey: { acceptedAnswers: ['30', '30.0', 'tiga puluh'] },
        explanation: '15/100 * 200 = 30.',
        options: [],
      },
      {
        id: SEED_IDS.Q5_ESSAY_ID,
        type: 'ESSAY',
        difficulty: 'HARD',
        category: 'PEMODELAN MATEMATIKA',
        stem: '<p>Sebuah tangki air mula-mula berisi 120 liter air dan bocor dengan laju konstan 4 liter per menit. Jelaskan langkah menentukan waktu hingga tangki kosong dan tuliskan persamaan linearnya!</p>',
        formula: 'V(t) = 120 - 4t',
        weight: 20,
        answerKey: {
          rubric: '1) Menuliskan persamaan V(t) = 120 - 4t (10 poin). 2) Menyelesaikan 120 - 4t = 0 sehingga t = 30 menit (10 poin).',
          keywords: ['120 - 4t', '30'],
        },
        explanation: 'Persamaan volume terhadap waktu adalah V(t) = 120 - 4t. Tangki kosong saat V(t)=0 => t=30 menit.',
        options: [],
      },
    ];

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      await tx.query(
        `INSERT INTO questions (
          id, question_bank_id, question_type, status, version, difficulty, category,
          tags, stem_html, formula_latex, default_weight, answer_key, explanation_html, created_by
        ) VALUES ($1, $2, $3, 'PUBLISHED', 1, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (id) DO NOTHING`,
        [
          q.id,
          SEED_IDS.BANK_TKA_MATEMATIKA_ID,
          q.type,
          q.difficulty,
          q.category,
          JSON.stringify(['TKA-2026', q.category]),
          q.stem,
          q.formula,
          q.weight,
          JSON.stringify(q.answerKey),
          q.explanation,
          SEED_IDS.USER_TEACHER_1_ID,
        ],
      );

      for (const opt of q.options) {
        await tx.query(
          `INSERT INTO question_options (id, question_id, option_key, content_html, is_correct, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (question_id, option_key) DO NOTHING`,
          [opt.id, q.id, opt.key, opt.html, opt.isCorrect, opt.order],
        );
      }
    }

    // 9. Exam Package & Exam Questions
    await tx.query(
      `INSERT INTO exams (
        id, school_id, subject_id, academic_year_id, title, code, instructions_html,
        status, duration_minutes, randomize_questions, randomize_options,
        browser_policy, camera_enabled, offline_enabled, offline_grace_period_seconds,
        max_offline_unsynced_answers, publish_results, passing_score, created_by
      ) VALUES (
        $1, $2, $3, $4,
        'Simulasi Ujian TKA Matematika SMA 2026',
        'TKA-MTK-2026-01',
        '<ol><li>Berdoalah sebelum memulai ujian.</li><li>Waktu ujian dihitung oleh server secara otomatis.</li><li>Jawaban tersimpan otomatis ke server dan dibackup pada buffer perangkat jika sinyal terputus sementara.</li><li>Dilarang membuka tab/aplikasi lain atau bekerja sama selama ujian berlangsung.</li></ol>',
        'READY', 90, TRUE, TRUE,
        'STANDARD_BROWSER', FALSE, TRUE, 120,
        100, TRUE, 70.00, $5
      ) ON CONFLICT (id) DO NOTHING`,
      [
        SEED_IDS.EXAM_TKA_UTAMA_ID,
        SEED_IDS.SCHOOL_ID,
        SEED_IDS.SUBJECT_MATEMATIKA_ID,
        SEED_IDS.ACADEMIC_YEAR_ID,
        SEED_IDS.USER_TEACHER_1_ID,
      ],
    );

    const examQuestionIds = [
      '81000000-0000-4000-8000-000000000001',
      '81000000-0000-4000-8000-000000000002',
      '81000000-0000-4000-8000-000000000003',
      '81000000-0000-4000-8000-000000000004',
      '81000000-0000-4000-8000-000000000005',
    ];
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      await tx.query(
        `INSERT INTO exam_questions (id, exam_id, question_id, question_version, question_snapshot, order_no, weight)
         VALUES ($1, $2, $3, 1, $4, $5, $6)
         ON CONFLICT (exam_id, question_id) DO NOTHING`,
        [
          examQuestionIds[i],
          SEED_IDS.EXAM_TKA_UTAMA_ID,
          q.id,
          JSON.stringify({
            id: q.id,
            type: q.type,
            version: 1,
            stem: q.stem,
            formula: q.formula,
            weight: q.weight,
            answerKey: q.answerKey,
            options: q.options,
          }),
          i + 1,
          q.weight,
        ],
      );
    }

    // 10. Exam Assignment to Class XII MIPA 1
    await tx.query(
      `INSERT INTO exam_assignments (id, exam_id, class_id, assigned_by)
       VALUES ('82000000-0000-4000-8000-000000000001', $1, $2, $3)
       ON CONFLICT (exam_id, class_id) DO NOTHING`,
      [SEED_IDS.EXAM_TKA_UTAMA_ID, SEED_IDS.CLASS_XII_IPA_1_ID, SEED_IDS.USER_ADMIN_ID],
    );

    // 11. Exam Sessions (Lab 1 & Lab 2)
    const now = new Date();
    const startWindow = new Date(now.getTime() - 3600 * 1000).toISOString();
    const endWindow = new Date(now.getTime() + 7 * 24 * 3600 * 1000).toISOString();

    await tx.query(
      `INSERT INTO exam_sessions (id, exam_id, room_id, title, access_token, status, scheduled_start_at, scheduled_end_at)
       VALUES
         ($1, $3, $4, 'Sesi 1 — Lab Komputer 1 (XII MIPA 1)', 'TKA2026A', 'READY', $6, $7),
         ($2, $3, $5, 'Sesi 2 — Lab Komputer 2 (XII MIPA 2)', 'TKA2026B', 'READY', $6, $7)
       ON CONFLICT (id) DO NOTHING`,
      [
        SEED_IDS.SESSION_LAB_1_ID,
        SEED_IDS.SESSION_LAB_2_ID,
        SEED_IDS.EXAM_TKA_UTAMA_ID,
        SEED_IDS.ROOM_LAB_1_ID,
        SEED_IDS.ROOM_LAB_2_ID,
        startWindow,
        endWindow,
      ],
    );

    // 12. Proctors & Supervisors Assignments
    await tx.query(
      `INSERT INTO exam_proctors (id, exam_session_id, proctor_user_id)
       VALUES
         ('91000000-0000-4000-8000-000000000001', $1, $3),
         ('91000000-0000-4000-8000-000000000002', $2, $4)
       ON CONFLICT (exam_session_id, proctor_user_id) DO NOTHING`,
      [
        SEED_IDS.SESSION_LAB_1_ID,
        SEED_IDS.SESSION_LAB_2_ID,
        SEED_IDS.USER_PROCTOR_1_ID,
        SEED_IDS.USER_PROCTOR_2_ID,
      ],
    );

    await tx.query(
      `INSERT INTO exam_supervisors (id, exam_session_id, room_id, supervisor_user_id)
       VALUES
         ('92000000-0000-4000-8000-000000000001', $1, $3, $5),
         ('92000000-0000-4000-8000-000000000002', $2, $4, $6)
       ON CONFLICT (exam_session_id, supervisor_user_id) DO NOTHING`,
      [
        SEED_IDS.SESSION_LAB_1_ID,
        SEED_IDS.SESSION_LAB_2_ID,
        SEED_IDS.ROOM_LAB_1_ID,
        SEED_IDS.ROOM_LAB_2_ID,
        SEED_IDS.USER_SUPERVISOR_1_ID,
        SEED_IDS.USER_SUPERVISOR_2_ID,
      ],
    );

    // 13. Enroll Participants
    const participants = [
      {
        id: SEED_IDS.PARTICIPANT_STUDENT_1_ID,
        sessionId: SEED_IDS.SESSION_LAB_1_ID,
        studentId: SEED_IDS.USER_STUDENT_1_ID,
        classId: SEED_IDS.CLASS_XII_IPA_1_ID,
      },
      {
        id: SEED_IDS.PARTICIPANT_STUDENT_2_ID,
        sessionId: SEED_IDS.SESSION_LAB_1_ID,
        studentId: SEED_IDS.USER_STUDENT_2_ID,
        classId: SEED_IDS.CLASS_XII_IPA_1_ID,
      },
      {
        id: SEED_IDS.PARTICIPANT_STUDENT_3_ID,
        sessionId: SEED_IDS.SESSION_LAB_2_ID,
        studentId: SEED_IDS.USER_STUDENT_3_ID,
        classId: SEED_IDS.CLASS_XII_IPA_2_ID,
      },
    ];

    for (const p of participants) {
      await tx.query(
        `INSERT INTO exam_participants (id, exam_session_id, exam_id, student_user_id, class_id, status)
         VALUES ($1, $2, $3, $4, $5, 'READY')
         ON CONFLICT (exam_session_id, student_user_id) DO NOTHING`,
        [p.id, p.sessionId, SEED_IDS.EXAM_TKA_UTAMA_ID, p.studentId, p.classId],
      );
    }

    // 14. Default System Settings
    const defaultSettings = [
      {
        id: 'b0000000-0000-4000-8000-000000000001',
        key: 'security_policy',
        value: {
          defaultBrowserPolicy: 'STANDARD_BROWSER',
          detectVisibilityChange: true,
          detectWindowBlur: true,
          maxTabSwitchWarnings: 3,
          enforceSingleActiveSession: true,
        },
      },
      {
        id: 'b0000000-0000-4000-8000-000000000002',
        key: 'offline_and_camera_policy',
        value: {
          offlineEnabledByDefault: true,
          defaultOfflineGracePeriodSeconds: 120,
          maxOfflineUnsyncedAnswers: 100,
          maxOfflineBufferBytes: 5242880,
          cameraEnabledByDefault: false,
          cameraRetentionDays: 14,
          requireExplicitCameraConsent: true,
        },
      },
    ];

    for (const s of defaultSettings) {
      await tx.query(
        `INSERT INTO system_settings (id, school_id, setting_key, setting_value, updated_by_user_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (school_id, setting_key) DO NOTHING`,
        [s.id, SEED_IDS.SCHOOL_ID, s.key, JSON.stringify(s.value), SEED_IDS.USER_ADMIN_ID],
      );
    }
  });
}
