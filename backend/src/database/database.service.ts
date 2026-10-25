import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { PGlite } from '@electric-sql/pglite';
import * as fs from 'fs';
import * as path from 'path';

export interface QueryResultRow {
  [column: string]: any;
}

export interface DbQueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

export interface DbTransactionClient {
  query<T = any>(sql: string, params?: any[]): Promise<DbQueryResult<T>>;
}

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private pgPool: Pool | null = null;
  private pglite: PGlite | null = null;
  private driverType: 'pg' | 'pglite' = 'pglite';
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private txMutex: Promise<void> = Promise.resolve();

  constructor(private readonly customDatabaseUrl?: string) {}

  async onModuleInit(): Promise<void> {
    await this.ensureInitialized();
  }

  async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const dbUrl =
        this.customDatabaseUrl ||
        process.env.DATABASE_URL ||
        'pglite://./.pglite-data';

      if (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://')) {
        this.driverType = 'pg';
        this.pgPool = new Pool({
          connectionString: dbUrl,
          max: Number(process.env.DB_POOL_MAX || 50),
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 10000,
        });
      } else {
        this.driverType = 'pglite';
        const rawTarget = dbUrl.replace(/^pglite:\/\//, '');
        if (rawTarget === 'memory' || rawTarget === ':memory:') {
          this.pglite = new PGlite();
        } else {
          const dataDir = path.resolve(process.cwd(), rawTarget);
          fs.mkdirSync(path.dirname(dataDir), { recursive: true });
          this.pglite = new PGlite(dataDir);
        }
        await this.pglite.waitReady;
      }

      this.initialized = true;
    })();

    return this.initPromise;
  }

  getDriverType(): 'pg' | 'pglite' {
    return this.driverType;
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<DbQueryResult<T>> {
    await this.ensureInitialized();
    if (this.driverType === 'pg' && this.pgPool) {
      const res = await this.pgPool.query(sql, params);
      return {
        rows: res.rows as T[],
        rowCount: res.rowCount ?? res.rows.length,
      };
    }

    if (!this.pglite) {
      throw new Error('PGlite instance is not initialized');
    }
    const res = await this.pglite.query<T>(sql, params);
    return {
      rows: res.rows,
      rowCount: res.affectedRows ?? res.rows.length,
    };
  }

  async execMultiSql(sql: string): Promise<void> {
    await this.ensureInitialized();
    if (this.driverType === 'pg' && this.pgPool) {
      await this.pgPool.query(sql);
      return;
    }
    if (!this.pglite) {
      throw new Error('PGlite instance is not initialized');
    }
    await this.pglite.exec(sql);
  }

  async withTransaction<T>(fn: (tx: DbTransactionClient) => Promise<T>): Promise<T> {
    await this.ensureInitialized();

    if (this.driverType === 'pg' && this.pgPool) {
      const client = await this.pgPool.connect();
      try {
        await client.query('BEGIN');
        const txClient: DbTransactionClient = {
          query: async <R = any>(sql: string, params: any[] = []) => {
            const res = await client.query(sql, params);
            return {
              rows: res.rows as R[],
              rowCount: res.rowCount ?? res.rows.length,
            };
          },
        };
        const result = await fn(txClient);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    if (!this.pglite) {
      throw new Error('PGlite instance is not initialized');
    }

    // Serialize transactions on single-connection PGlite to ensure strict ACID isolation
    let releaseLock!: () => void;
    const prevMutex = this.txMutex;
    this.txMutex = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    await prevMutex;
    try {
      return await this.pglite.transaction(async (pgliteTx) => {
        const txClient: DbTransactionClient = {
          query: async <R = any>(sql: string, params: any[] = []) => {
            const res = await pgliteTx.query<R>(sql, params);
            return {
              rows: res.rows,
              rowCount: res.affectedRows ?? res.rows.length,
            };
          },
        };
        return await fn(txClient);
      });
    } finally {
      releaseLock();
    }
  }

  async runMigrations(): Promise<{ applied: string[] }> {
    await this.ensureInitialized();
    const migrationsDir = path.resolve(__dirname, 'migrations');
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    await this.execMultiSql(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(64) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const applied: string[] = [];
    for (const file of files) {
      const existing = await this.query<{ version: string }>(
        'SELECT version FROM schema_migrations WHERE version = $1',
        [file],
      );
      if (existing.rows.length === 0) {
        const sqlContent = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        await this.execMultiSql(sqlContent);
        await this.query(
          'INSERT INTO schema_migrations (version, applied_at) VALUES ($1, NOW()) ON CONFLICT (version) DO NOTHING',
          [file],
        );
        applied.push(file);
      }
    }

    return { applied };
  }

  async getHealthStats(): Promise<{
    healthy: boolean;
    driver: string;
    tableCount: number;
    latencyMs: number;
  }> {
    const start = performance.now();
    const res = await this.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const latencyMs = Math.round((performance.now() - start) * 100) / 100;
    return {
      healthy: true,
      driver: this.driverType,
      tableCount: Number(res.rows[0]?.count || 0),
      latencyMs,
    };
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pgPool) {
      await this.pgPool.end();
      this.pgPool = null;
    }
    if (this.pglite) {
      await this.pglite.close();
      this.pglite = null;
    }
    this.initialized = false;
    this.initPromise = null;
  }
}
