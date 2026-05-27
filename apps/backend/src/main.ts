import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
  );

  // Prefijo global para todas las rutas
  app.setGlobalPrefix('api');

  // Validación automática de DTOs con class-validator
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // elimina propiedades no declaradas en el DTO
      forbidNonWhitelisted: true,
      transform: true, // convierte tipos automáticamente (string → number, etc.)
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // CORS — permite llamadas desde el frontend en CloudFront
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? '*',
    methods: ['GET', 'POST', 'OPTIONS'],
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0'); // 0.0.0.0 necesario para Docker

  logger.log(`Application running on port ${port}`);
  logger.log(`Environment: ${process.env.NODE_ENV ?? 'development'}`);
}

bootstrap();
