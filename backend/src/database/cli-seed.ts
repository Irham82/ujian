import { DatabaseService } from './database.service';
import { runDevelopmentSeed } from './seed';

async function main() {
  const db = new DatabaseService();
  try {
    await runDevelopmentSeed(db);
    const users = await db.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM users');
    const questions = await db.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM questions');
    console.log(
      JSON.stringify({
        status: 'SEED_COMPLETED',
        usersCount: Number(users.rows[0]?.count || 0),
        questionsCount: Number(questions.rows[0]?.count || 0),
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
