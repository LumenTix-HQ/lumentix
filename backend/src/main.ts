import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import {
  corsOptions,
  helmetOptions,
  swaggerHelmetOptions,
} from './common/security/security.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ── Trust proxy hops so req.ip is the real client IP ─────────────────────
  const trustProxy = parseInt(process.env.TRUST_PROXY_HOPS ?? '1', 10);
  if (!isNaN(trustProxy) && trustProxy >= 0) {
    app.getHttpAdapter().getInstance().set('trust proxy', trustProxy);
  }

  // Strict CSP everywhere; the Swagger UI (non-production only) gets its own
  // relaxed policy because it needs inline scripts and styles.
  const strictHelmet = helmet(helmetOptions);
  const swaggerHelmet = helmet(swaggerHelmetOptions);
  const swaggerEnabled = process.env.NODE_ENV !== 'production';
  app.use((req: any, res: any, next: any) => {
    const isDocs =
      swaggerEnabled &&
      (req.path === '/api' ||
        req.path.startsWith('/api/') ||
        req.path === '/api-json');
    return (isDocs ? swaggerHelmet : strictHelmet)(req, res, next);
  });
  app.enableCors(corsOptions);

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // ── Swagger security: only expose in non-production environments ────────
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Lumentix API')
      .setDescription('Internal development documentation')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, document);

    console.log('🔍 Swagger available at /api (development only)');
  }

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
