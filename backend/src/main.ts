import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { corsOptions, helmetOptions } from './common/security/security.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ── Trust first proxy hop so req.ip is the real client IP ─────────────────
  // app.getHttpAdapter().getInstance().set('trust proxy', 1); // ← add

  app.use(helmet(helmetOptions));
  app.enableCors(corsOptions);

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
