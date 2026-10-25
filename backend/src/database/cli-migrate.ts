import { DatabaseService } from './database.service';

async function main() {
  const db = new DatabaseService();
  try {
    const res = await db.runMigrations();
    const health = await db.getHealthStats();
    console.log(
      JSON.stringify({
        status: 'OK',
        appliedMigrations: res.applied,
        driver: health.driver,
        tableCount: health.tableCount,
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
