-- ============================================================================
-- CBT PRO — 001_initial_schema.sql
-- Complete 31-Table PostgreSQL Schema with PK, FK, Unique Constraints & Indexes
-- ============================================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(64) PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1. schools
CREATE TABLE IF NOT EXISTS schools (
  id UUID PRIMARY KEY,
  code VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Makassar',
  address TEXT,
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 2. academic_years
CREATE TABLE IF NOT EXISTS academic_years (
  id UUID PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name VARCHAR(64) NOT NULL,
  semester VARCHAR(16) NOT NULL CHECK (semester IN ('GANJIL', 'GENAP')),
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, name, semester)
);

-- 3. users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  username VARCHAR(100) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  full_name VARCHAR(255) NOT NULL,
  identifier_code VARCHAR(64),
  password_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  active_session_id VARCHAR(128),
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 4. roles
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY,
  code VARCHAR(32) NOT NULL UNIQUE CHECK (code IN ('ADMIN', 'TEACHER', 'PROCTOR', 'SUPERVISOR', 'STUDENT')),
  name VARCHAR(64) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. user_roles
CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, role_id)
);

-- 6. classes
CREATE TABLE IF NOT EXISTS classes (
  id UUID PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  grade_level VARCHAR(32) NOT NULL,
  homeroom_teacher_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (school_id, academic_year_id, name)
);

-- 7. class_memberships
CREATE TABLE IF NOT EXISTS class_memberships (
  id UUID PRIMARY KEY,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  membership_role VARCHAR(16) NOT NULL CHECK (membership_role IN ('STUDENT', 'TEACHER')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (class_id, user_id, membership_role)
);

-- 8. subjects
CREATE TABLE IF NOT EXISTS subjects (
  id UUID PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  code VARCHAR(32) NOT NULL,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, code)
);

-- 9. rooms
CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  code VARCHAR(32) NOT NULL,
  name VARCHAR(150) NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 40,
  location VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, code)
);

-- 10. question_banks
CREATE TABLE IF NOT EXISTS question_banks (
  id UUID PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  owner_teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  is_shared BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 11. questions
CREATE TABLE IF NOT EXISTS questions (
  id UUID PRIMARY KEY,
  question_bank_id UUID NOT NULL REFERENCES question_banks(id) ON DELETE CASCADE,
  question_type VARCHAR(32) NOT NULL CHECK (question_type IN ('SINGLE_CHOICE', 'MULTIPLE_CHOICE_COMPLEX', 'TRUE_FALSE', 'SHORT_ANSWER', 'ESSAY')),
  status VARCHAR(16) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'REVIEW', 'PUBLISHED')),
  version INTEGER NOT NULL DEFAULT 1,
  difficulty VARCHAR(16) NOT NULL DEFAULT 'MEDIUM' CHECK (difficulty IN ('EASY', 'MEDIUM', 'HARD')),
  category VARCHAR(100) NOT NULL DEFAULT 'UMUM',
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  stem_html TEXT NOT NULL,
  stimulus_table_json JSONB,
  formula_latex TEXT,
  default_weight NUMERIC(6,2) NOT NULL DEFAULT 1.00,
  answer_key JSONB NOT NULL,
  explanation_html TEXT,
  version_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 12. question_options
CREATE TABLE IF NOT EXISTS question_options (
  id UUID PRIMARY KEY,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  option_key VARCHAR(16) NOT NULL,
  content_html TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (question_id, option_key)
);

-- 13. question_assets
CREATE TABLE IF NOT EXISTS question_assets (
  id UUID PRIMARY KEY,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  asset_type VARCHAR(32) NOT NULL CHECK (asset_type IN ('IMAGE', 'TABLE', 'FORMULA', 'DOCUMENT')),
  file_name VARCHAR(255) NOT NULL,
  storage_key TEXT NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size_bytes INTEGER NOT NULL DEFAULT 0,
  alt_text VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 14. exams
CREATE TABLE IF NOT EXISTS exams (
  id UUID PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
  academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
  title VARCHAR(255) NOT NULL,
  code VARCHAR(64) NOT NULL UNIQUE,
  instructions_html TEXT NOT NULL DEFAULT '',
  status VARCHAR(24) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SCHEDULED', 'READY', 'IN_PROGRESS', 'PAUSED', 'SUBMITTED', 'EXPIRED', 'CANCELLED')),
  duration_minutes INTEGER NOT NULL DEFAULT 90,
  randomize_questions BOOLEAN NOT NULL DEFAULT TRUE,
  randomize_options BOOLEAN NOT NULL DEFAULT TRUE,
  browser_policy VARCHAR(32) NOT NULL DEFAULT 'STANDARD_BROWSER' CHECK (browser_policy IN ('SECURE_BROWSER_REQUIRED', 'SECURE_BROWSER_OPTIONAL', 'STANDARD_BROWSER')),
  seb_config_key_hash VARCHAR(128),
  camera_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  camera_retention_days INTEGER NOT NULL DEFAULT 14,
  offline_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  offline_grace_period_seconds INTEGER NOT NULL DEFAULT 120,
  max_offline_unsynced_answers INTEGER NOT NULL DEFAULT 100,
  max_offline_buffer_bytes INTEGER NOT NULL DEFAULT 5242880,
  conflict_policy VARCHAR(32) NOT NULL DEFAULT 'LATEST_VALID_WITHIN_GRACE' CHECK (conflict_policy IN ('LATEST_VALID_WITHIN_GRACE', 'SERVER_WINS_LOG_BOTH')),
  publish_results BOOLEAN NOT NULL DEFAULT FALSE,
  passing_score NUMERIC(6,2) NOT NULL DEFAULT 70.00,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 15. exam_questions
CREATE TABLE IF NOT EXISTS exam_questions (
  id UUID PRIMARY KEY,
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
  question_version INTEGER NOT NULL DEFAULT 1,
  question_snapshot JSONB NOT NULL,
  order_no INTEGER NOT NULL,
  weight NUMERIC(6,2) NOT NULL DEFAULT 1.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (exam_id, question_id),
  UNIQUE (exam_id, order_no)
);

-- 16. exam_assignments
CREATE TABLE IF NOT EXISTS exam_assignments (
  id UUID PRIMARY KEY,
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  assigned_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (exam_id, class_id)
);

-- 17. exam_sessions
CREATE TABLE IF NOT EXISTS exam_sessions (
  id UUID PRIMARY KEY,
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  title VARCHAR(255) NOT NULL,
  access_token VARCHAR(32) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('DRAFT', 'SCHEDULED', 'READY', 'IN_PROGRESS', 'PAUSED', 'SUBMITTED', 'EXPIRED', 'CANCELLED')),
  scheduled_start_at TIMESTAMPTZ NOT NULL,
  scheduled_end_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 18. exam_proctors
CREATE TABLE IF NOT EXISTS exam_proctors (
  id UUID PRIMARY KEY,
  exam_session_id UUID NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
  proctor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (exam_session_id, proctor_user_id)
);

-- 19. exam_supervisors
CREATE TABLE IF NOT EXISTS exam_supervisors (
  id UUID PRIMARY KEY,
  exam_session_id UUID NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  supervisor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (exam_session_id, supervisor_user_id)
);

-- 20. exam_participants
CREATE TABLE IF NOT EXISTS exam_participants (
  id UUID PRIMARY KEY,
  exam_session_id UUID NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  class_id UUID REFERENCES classes(id) ON DELETE SET NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'READY' CHECK (status IN ('DRAFT', 'SCHEDULED', 'READY', 'IN_PROGRESS', 'PAUSED', 'SUBMITTED', 'EXPIRED', 'CANCELLED')),
  question_order JSONB NOT NULL DEFAULT '[]'::jsonb,
  option_orders JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ,
  server_deadline_at TIMESTAMPTZ,
  extra_time_seconds INTEGER NOT NULL DEFAULT 0,
  paused_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  session_binding_token VARCHAR(128),
  device_info JSONB NOT NULL DEFAULT '{}'::jsonb,
  seb_verified BOOLEAN NOT NULL DEFAULT FALSE,
  seb_override_by_proctor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  seb_override_reason TEXT,
  camera_consent_given BOOLEAN NOT NULL DEFAULT FALSE,
  camera_alternative_approved BOOLEAN NOT NULL DEFAULT FALSE,
  camera_alternative_notes TEXT,
  connection_status VARCHAR(32) NOT NULL DEFAULT 'ONLINE' CHECK (connection_status IN ('ONLINE', 'OFFLINE_WITHIN_GRACE', 'OFFLINE_EXCEEDED_GRACE', 'DISCONNECTED')),
  offline_since_at TIMESTAMPTZ,
  unsynced_answers_count INTEGER NOT NULL DEFAULT 0,
  security_events_count INTEGER NOT NULL DEFAULT 0,
  needs_review BOOLEAN NOT NULL DEFAULT FALSE,
  last_heartbeat_at TIMESTAMPTZ,
  final_score NUMERIC(6,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (exam_session_id, student_user_id)
);

-- 21. participant_answers
CREATE TABLE IF NOT EXISTS participant_answers (
  id UUID PRIMARY KEY,
  exam_participant_id UUID NOT NULL REFERENCES exam_participants(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
  answer_payload JSONB NOT NULL,
  is_marked_for_review BOOLEAN NOT NULL DEFAULT FALSE,
  answer_version INTEGER NOT NULL DEFAULT 1,
  last_idempotency_key VARCHAR(128) NOT NULL,
  sync_source VARCHAR(24) NOT NULL DEFAULT 'ONLINE' CHECK (sync_source IN ('ONLINE', 'OFFLINE_SYNC')),
  client_updated_at TIMESTAMPTZ,
  server_saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (exam_participant_id, question_id)
);

-- 22. answer_events
CREATE TABLE IF NOT EXISTS answer_events (
  id UUID PRIMARY KEY,
  participant_answer_id UUID NOT NULL REFERENCES participant_answers(id) ON DELETE CASCADE,
  exam_participant_id UUID NOT NULL REFERENCES exam_participants(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
  idempotency_key VARCHAR(128) NOT NULL UNIQUE,
  answer_version INTEGER NOT NULL,
  previous_payload JSONB,
  new_payload JSONB NOT NULL,
  is_marked_for_review BOOLEAN NOT NULL DEFAULT FALSE,
  sync_source VARCHAR(24) NOT NULL DEFAULT 'ONLINE',
  conflict_detected BOOLEAN NOT NULL DEFAULT FALSE,
  conflict_resolution VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 23. exam_submissions
CREATE TABLE IF NOT EXISTS exam_submissions (
  id UUID PRIMARY KEY,
  exam_participant_id UUID NOT NULL UNIQUE REFERENCES exam_participants(id) ON DELETE CASCADE,
  idempotency_key VARCHAR(128) NOT NULL UNIQUE,
  submitted_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  submission_reason VARCHAR(32) NOT NULL CHECK (submission_reason IN ('MANUAL_SUBMIT', 'TIMER_EXPIRED', 'PROCTOR_FORCE_SUBMIT')),
  answers_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  auto_score NUMERIC(6,2) NOT NULL DEFAULT 0.00,
  manual_score NUMERIC(6,2) NOT NULL DEFAULT 0.00,
  total_score NUMERIC(6,2) NOT NULL DEFAULT 0.00,
  max_possible_score NUMERIC(6,2) NOT NULL DEFAULT 0.00,
  percentage_score NUMERIC(6,2) NOT NULL DEFAULT 0.00,
  grading_status VARCHAR(24) NOT NULL DEFAULT 'AUTO_GRADED' CHECK (grading_status IN ('AUTO_GRADED', 'PENDING_MANUAL_ESSAY', 'FULLY_GRADED')),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 24. grading_records
CREATE TABLE IF NOT EXISTS grading_records (
  id UUID PRIMARY KEY,
  exam_participant_id UUID NOT NULL REFERENCES exam_participants(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
  question_version INTEGER NOT NULL DEFAULT 1,
  is_auto_graded BOOLEAN NOT NULL DEFAULT TRUE,
  is_correct BOOLEAN,
  score_awarded NUMERIC(6,2) NOT NULL DEFAULT 0.00,
  max_score NUMERIC(6,2) NOT NULL DEFAULT 1.00,
  graded_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  feedback TEXT,
  graded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (exam_participant_id, question_id)
);

-- 25. attendance_records
CREATE TABLE IF NOT EXISTS attendance_records (
  id UUID PRIMARY KEY,
  exam_session_id UUID NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
  exam_participant_id UUID NOT NULL UNIQUE REFERENCES exam_participants(id) ON DELETE CASCADE,
  status VARCHAR(24) NOT NULL DEFAULT 'PRESENT' CHECK (status IN ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED')),
  notes TEXT,
  recorded_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 26. incident_reports
CREATE TABLE IF NOT EXISTS incident_reports (
  id UUID PRIMARY KEY,
  exam_session_id UUID NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
  exam_participant_id UUID REFERENCES exam_participants(id) ON DELETE SET NULL,
  reported_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reporter_role VARCHAR(32) NOT NULL,
  category VARCHAR(64) NOT NULL,
  severity VARCHAR(24) NOT NULL DEFAULT 'MEDIUM' CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  escalated_to_admin BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(24) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_REVIEW', 'RESOLVED', 'ESCALATED')),
  resolution_notes TEXT,
  resolved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 27. anti_cheating_events
CREATE TABLE IF NOT EXISTS anti_cheating_events (
  id UUID PRIMARY KEY,
  exam_session_id UUID NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
  exam_participant_id UUID NOT NULL REFERENCES exam_participants(id) ON DELETE CASCADE,
  event_type VARCHAR(64) NOT NULL CHECK (event_type IN (
    'TAB_HIDDEN',
    'WINDOW_BLUR',
    'SESSION_DUPLICATE',
    'INVALID_SESSION',
    'RATE_LIMIT_TRIGGERED',
    'UNAUTHORIZED_ACCESS',
    'CONNECTION_INTERRUPTED',
    'CONNECTION_RESTORED',
    'OFFLINE_BUFFER_CREATED',
    'OFFLINE_SYNC_COMPLETED',
    'OFFLINE_SYNC_CONFLICT',
    'CAMERA_UNAVAILABLE',
    'EXAM_RESUMED',
    'EXAM_SUBMITTED',
    'PROCTOR_WARNING',
    'PROCTOR_INTERVENTION'
  )),
  classification VARCHAR(32) NOT NULL CHECK (classification IN ('INFORMATION', 'ATTENTION', 'REVIEW_REQUIRED', 'SECURITY_INCIDENT')),
  duration_ms INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  reviewed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  review_notes TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 28. offline_sync_batches
CREATE TABLE IF NOT EXISTS offline_sync_batches (
  id UUID PRIMARY KEY,
  exam_participant_id UUID NOT NULL REFERENCES exam_participants(id) ON DELETE CASCADE,
  batch_idempotency_key VARCHAR(128) NOT NULL UNIQUE,
  items_count INTEGER NOT NULL DEFAULT 0,
  accepted_count INTEGER NOT NULL DEFAULT 0,
  conflict_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0,
  offline_duration_seconds INTEGER NOT NULL DEFAULT 0,
  exceeded_grace_period BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(32) NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('COMPLETED', 'PARTIAL_CONFLICT', 'REJECTED_EXPIRED', 'REJECTED_REVOKED')),
  details JSONB NOT NULL DEFAULT '[]'::jsonb,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 29. audit_logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY,
  school_id UUID REFERENCES schools(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_role VARCHAR(32) NOT NULL,
  action VARCHAR(100) NOT NULL,
  target_type VARCHAR(64) NOT NULL,
  target_id VARCHAR(128),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address VARCHAR(64),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 30. notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  recipient_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  recipient_role VARCHAR(32),
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  category VARCHAR(32) NOT NULL DEFAULT 'ANNOUNCEMENT',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 31. system_settings
CREATE TABLE IF NOT EXISTS system_settings (
  id UUID PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  setting_key VARCHAR(100) NOT NULL,
  setting_value JSONB NOT NULL,
  updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, setting_key)
);

-- ============================================================================
-- MEASURED ACCESS-PATTERN INDEXES FOR 500+ CONCURRENT EXAM SESSIONS
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_users_school_username ON users(school_id, username);
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_class_memberships_user ON class_memberships(user_id, class_id);
CREATE INDEX IF NOT EXISTS idx_questions_bank_status ON questions(question_bank_id, status);
CREATE INDEX IF NOT EXISTS idx_exam_questions_exam_order ON exam_questions(exam_id, order_no);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_exam_room ON exam_sessions(exam_id, room_id, status);
CREATE INDEX IF NOT EXISTS idx_exam_participants_session_status ON exam_participants(exam_session_id, status, connection_status);
CREATE INDEX IF NOT EXISTS idx_exam_participants_student ON exam_participants(student_user_id, status);
CREATE INDEX IF NOT EXISTS idx_participant_answers_lookup ON participant_answers(exam_participant_id, question_id);
CREATE INDEX IF NOT EXISTS idx_answer_events_participant ON answer_events(exam_participant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_anti_cheating_session_time ON anti_cheating_events(exam_session_id, classification, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_anti_cheating_participant ON anti_cheating_events(exam_participant_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_school_time ON audit_logs(school_id, created_at DESC, action);
