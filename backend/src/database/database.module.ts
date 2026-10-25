import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [
    {
      provide: DatabaseService,
      useFactory: () => new DatabaseService(),
    },
    RedisService,
  ],
  exports: [DatabaseService, RedisService],
})
export class DatabaseModule {}
