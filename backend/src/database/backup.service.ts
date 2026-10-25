import { DatabaseService } from './database.service';
import { encryptBackupPayload, decryptBackupPayload } from '../common/crypto.util';
import * as fs from 'fs';
import * as path from 'path';

export const ORDERED_BACKUP_TABLES = [
  'schools',
  'academic_years',
  'roles',
  'users',
  'user_roles',
  'classes',
  'class_memberships',
  'subjects',
  'rooms',
  'question_banks',
  'questions',
  'question_options',
  'question_assets',
  'exams',
  'exam_questions',
  'exam_assignments',
  'exam_sessions',
  'exam_proctors',
  'exam_supervisors',
  'exam_participants',
  'participant_answers',
  'answer_events',
  'exam_submissions',
  'grading_records',
  'attendance_records',
  'incident_reports',
  'anti_cheating_events',
  'offline_sync_batches',
  'audit_logs',
  'notifications',
  'system_settings',
] as const;

export interface DatabaseBackupSnapshot {
  version: string;
  createdAt: string;
  tableCounts: Record<string, number>;
  tables: Record<string, any[]>;
}

export async function createEncryptedDatabaseBackup(
  db: DatabaseService,
  outputFilePath?: string,
  encryptionKey?: string,
): Promise<{
  encryptedPayload: string;
  filePath?: string;
  tableCounts: Record<string, number>;
  createdAt: string;
}> {
  const tables: Record<string, any[]> = {};
  const tableCounts: Record<string, number> = {};

  for (const tableName of ORDERED_BACKUP_TABLES) {
    const res = await db.query(`SELECT * FROM ${tableName}`);
    tables[tableName] = res.rows;
    tableCounts[tableName] = res.rows.length;
  }

  const snapshot: DatabaseBackupSnapshot = {
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    tableCounts,
    tables,
  };

  const encryptedPayload = encryptBackupPayload(JSON.stringify(snapshot), encryptionKey);
  if (outputFilePath) {
    const resolved = path.resolve(process.cwd(), outputFilePath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, encryptedPayload, 'utf8');
  }

  return {
    encryptedPayload,
    filePath: outputFilePath,
    tableCounts,
    createdAt: snapshot.createdAt,
  };
}

export async function restoreEncryptedDatabaseBackup(
  db: DatabaseService,
  encryptedPayload: string,
  encryptionKey?: string,
): Promise<{ restoredTables: number; totalRowsRestored: number }> {
  const plainJson = decryptBackupPayload(encryptedPayload, encryptionKey);
  const snapshot = JSON.parse(plainJson) as DatabaseBackupSnapshot;

  let totalRowsRestored = 0;

  await db.withTransaction(async (tx) => {
    // Delete in reverse foreign-key order
    const reverseTables = [...ORDERED_BACKUP_TABLES].reverse();
    for (const tableName of reverseTables) {
      await tx.query(`DELETE FROM ${tableName}`);
    }

    // Re-insert in forward dependency order
    for (const tableName of ORDERED_BACKUP_TABLES) {
      const rows = snapshot.tables[tableName] || [];
      for (const row of rows) {
        const columns = Object.keys(row);
        if (columns.length === 0) continue;
        const placeholders = columns.map((_, idx) => `$${idx + 1}`).join(', ');
        const colNames = columns.map((c) => `"${c}"`).join(', ');
        const values = columns.map((col) => {
          const v = row[col];
          if (v !== null && typeof v === 'object' && !(v instanceof Date)) {
            return JSON.stringify(v);
          }
          return v;
        });
        await tx.query(
          `INSERT INTO ${tableName} (${colNames}) VALUES (${placeholders})`,
          values,
        );
        totalRowsRestored++;
      }
    }
  });

  return {
    restoredTables: ORDERED_BACKUP_TABLES.length,
    totalRowsRestored,
  };
}
