import { DatabaseService } from './database.service';
import { restoreEncryptedDatabaseBackup } from './backup.service';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const inputFile = process.argv[2];
  if (!inputFile) {
    throw new Error('Usage: npm run db:restore -- <path-to-backup.sql.enc>');
  }
  const db = new DatabaseService();
  try {
    await db.runMigrations();
    const encrypted = fs.readFileSync(path.resolve(process.cwd(), inputFile), 'utf8');
    const result = await restoreEncryptedDatabaseBackup(db, encrypted);
    console.log(
      JSON.stringify({
        status: 'RESTORE_COMPLETED',
        restoredTables: result.restoredTables,
        totalRowsRestored: result.totalRowsRestored,
      }),
    );
  } finally {
    await db.onModuleDestroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
