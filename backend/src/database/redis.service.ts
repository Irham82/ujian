import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

interface MemoryEntry {
  value: string;
  expiresAt: number | null;
}

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis | null = null;
  private mode: 'ioredis' | 'memory' = 'memory';
  private store = new Map<string, MemoryEntry>();

  async onModuleInit(): Promise<void> {
    const redisUrl = process.env.REDIS_URL || 'memory://localhost:6379';
    if (redisUrl.startsWith('redis://') || redisUrl.startsWith('rediss://')) {
      try {
        const redisClient = new Redis(redisUrl, {
          maxRetriesPerRequest: 2,
          lazyConnect: true,
          connectTimeout: 3000,
        });
        await redisClient.connect();
        this.client = redisClient;
        this.mode = 'ioredis';
      } catch {
        this.mode = 'memory';
        this.client = null;
      }
    } else {
      this.mode = 'memory';
    }
  }

  getMode(): 'ioredis' | 'memory' {
    return this.mode;
  }

  private cleanExpired(key: string): void {
    const entry = this.store.get(key);
    if (entry && entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.store.delete(key);
    }
  }

  async get(key: string): Promise<string | null> {
    if (this.mode === 'ioredis' && this.client) {
      return this.client.get(key);
    }
    this.cleanExpired(key);
    const entry = this.store.get(key);
    return entry ? entry.value : null;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (this.mode === 'ioredis' && this.client) {
      if (ttlSeconds && ttlSeconds > 0) {
        await this.client.set(key, value, 'EX', ttlSeconds);
      } else {
        await this.client.set(key, value);
      }
      return;
    }
    this.store.set(key, {
      value,
      expiresAt: ttlSeconds && ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null,
    });
  }

  async del(key: string): Promise<void> {
    if (this.mode === 'ioredis' && this.client) {
      await this.client.del(key);
      return;
    }
    this.store.delete(key);
  }

  async incrWithWindow(key: string, windowSeconds: number): Promise<{ count: number; ttlRemaining: number }> {
    if (this.mode === 'ioredis' && this.client) {
      const count = await this.client.incr(key);
      if (count === 1) {
        await this.client.expire(key, windowSeconds);
      }
      const ttl = await this.client.ttl(key);
      return { count, ttlRemaining: ttl > 0 ? ttl : windowSeconds };
    }

    this.cleanExpired(key);
    const now = Date.now();
    const existing = this.store.get(key);
    if (!existing) {
      const expiresAt = now + windowSeconds * 1000;
      this.store.set(key, { value: '1', expiresAt });
      return { count: 1, ttlRemaining: windowSeconds };
    }

    const nextCount = Number(existing.value || '0') + 1;
    const expiresAt = existing.expiresAt ?? now + windowSeconds * 1000;
    this.store.set(key, { value: String(nextCount), expiresAt });
    return {
      count: nextCount,
      ttlRemaining: Math.max(1, Math.ceil((expiresAt - now) / 1000)),
    };
  }

  async pingLatencyMs(): Promise<number> {
    const start = performance.now();
    if (this.mode === 'ioredis' && this.client) {
      await this.client.ping();
    } else {
      this.cleanExpired('__healthcheck__');
    }
    return Math.round((performance.now() - start) * 1000) / 1000;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
    }
    this.store.clear();
  }
}
