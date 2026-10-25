import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuditService } from '../../common/audit.service';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from '../../common/auth.guard';

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    AuditService,
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
  exports: [AuthService, AuditService],
})
export class AuthModule {}
