import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public, Roles } from '../../common/roles.decorator';
import { DatabaseService } from '../../database/database.service';
import { RedisService } from '../../database/redis.service';

@ApiTags('Observability & Health')
@Controller('health')
export class ObservabilityController {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(RedisService) private readonly redis: RedisService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Health check aplikasi, database PostgreSQL, dan Redis' })
  async healthCheck() {
    const dbStats = await this.db.getHealthStats();
    const redisLatencyMs = await this.redis.pingLatencyMs();
    const mem = process.memoryUsage();
    return {
      status: dbStats.healthy ? 'OK' : 'DEGRADED',
      serverTimeUtc: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      database: dbStats,
      redis: {
        mode: this.redis.getMode(),
        latencyMs: redisLatencyMs,
      },
      memoryMb: {
        rss: Math.round((mem.rss / 1024 / 1024) * 100) / 100,
        heapUsed: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100,
      },
    };
  }

  @Roles('ADMIN', 'PROCTOR')
  @Get('metrics')
  @ApiOperation({ summary: 'Metrik operasional sesi ujian aktif, antrean sinkronisasi, dan event keamanan' })
  async metrics() {
    const [activeRes, unsyncedRes, eventsRes] = await Promise.all([
      this.db.query<{ status: string; count: string }>(
        `SELECT status, COUNT(*)::text AS count FROM exam_participants GROUP BY status`,
      ),
      this.db.query<{ total_unsynced: string }>(
        `SELECT COALESCE(SUM(unsynced_answers_count), 0)::text AS total_unsynced FROM exam_participants`,
      ),
      this.db.query<{ classification: string; count: string }>(
        `SELECT classification, COUNT(*)::text AS count FROM anti_cheating_events GROUP BY classification`,
      ),
    ]);

    return {
      timestampUtc: new Date().toISOString(),
      participantStatusBreakdown: activeRes.rows,
      totalUnsyncedAnswersPending: Number(unsyncedRes.rows[0]?.total_unsynced || 0),
      securityEventsByClassification: eventsRes.rows,
    };
  }
}
