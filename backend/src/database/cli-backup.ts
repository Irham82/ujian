import { DatabaseService } from './database.service';
import { createEncryptedDatabaseBackup } from './backup.service';

async function main() {
  const db = new DatabaseService();
  try {
    await db.ensureInitialized();
    const outPath = process.argv[2] || `./backups/cbt-pro-backup-${Date.now()}.sql.enc`;
    const result = await createEncryptedDatabaseBackup(db, outPath);
    console.log(
      JSON.stringify({
        status: 'BACKUP_COMPLETED',
        filePath: result.filePath,
        createdAt: result.createdAt,
        tableCounts: result.tableCounts,
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
