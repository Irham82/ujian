import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

export async function createConfiguredApp() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  app.use(cookieParser());
  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: process.env.FRONTEND_URL || ['http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-CSRF-Token',
      'X-SafeExamBrowser-ConfigKeyHash',
      'X-SafeExamBrowser-RequestHash',
      'X-Idempotency-Key',
    ],
  });

  try {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('CBT PRO — Secure Computer-Based Test API')
      .setDescription(
        'REST API untuk Platform Ujian Berbasis Komputer (500+ Sesi Aktif, BYOD, Mode Offline Terbatas, RBAC 5 Role)',
      )
      .setVersion('1.0.0')
      .addBearerAuth()
      .addCookieAuth('cbt_access_token')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  } catch {
    // Skip Swagger metadata exploration in environments without emitDecoratorMetadata (e.g., esbuild test runner)
  }

  return app;
}

async function bootstrap() {
  const app = await createConfiguredApp();
  const port = Number(process.env.PORT || 4000);
  await app.listen(port, '0.0.0.0');
  console.log(`CBT PRO Backend listening on http://localhost:${port}/api/v1`);
}

if (require.main === module) {
  bootstrap().catch((err) => {
    console.error('Failed to start CBT PRO Backend:', err);
    process.exit(1);
  });
}
