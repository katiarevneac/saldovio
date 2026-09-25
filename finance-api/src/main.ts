import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ZodValidationPipe } from 'nestjs-zod';
import { AppModule } from './app.module.js';
import { validateEnv } from './common/validate-env.js';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';

async function bootstrap() {
  validateEnv(process.env, ['DATABASE_URL', 'INTERNAL_API_SECRET']);

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useBodyParser('json', { limit: '5mb' });

  // Narrowed from origin:true (improvements.md S04.12) — finance-api is
  // never called from the browser (BFF pattern since Epic 7 S3/S4), so
  // this isn't the real security boundary, but an open wildcard is
  // still worth closing now that this epic owns it (Epic 12's own
  // design doc parked this exact decision for "this epic").
  const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3001';
  const allowedOrigins = new Set([webOrigin, 'http://localhost:3001']);
  app.enableCors({ origin: [...allowedOrigins] });

  app.useGlobalPipes(new ZodValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
