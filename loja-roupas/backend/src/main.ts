import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import express from 'express';
import { getMediaDirectory } from './catalog/media-storage';
import { AppModule } from './app.module';
import { createPublicRateLimitMiddleware } from './common/public-rate-limit';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 0);
  if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 5) {
    throw new Error('TRUST_PROXY_HOPS deve ser um inteiro entre 0 e 5.');
  }
  app.getHttpAdapter().getInstance().set('trust proxy', trustProxyHops);

  app.setGlobalPrefix('api');
  app.use(createPublicRateLimitMiddleware());
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });
  app.use('/media', express.static(getMediaDirectory(), { index: false, dotfiles: 'deny', immutable: true, maxAge: '1y' }));
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  console.log(`API rodando em http://localhost:${port}/api`);
}
bootstrap();
