import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded } from 'express';
import type { IncomingMessage } from 'http';
import { createRouteHandler } from 'uploadthing/express';

import { AppModule } from './app.module';
import { UploadAuthorizationService } from './uploadthing/upload-authorization.service';
import { createUploadRouter } from './uploadthing/upload-router';

function getAllowedOrigins(value: string | undefined) {
  return (value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });

  // Use the actual client IP for rate limiting only when a trusted reverse
  // proxy is configured by the deployment. Never trust forwarded headers on
  // a directly exposed API, where a client could forge them.
  const trustProxy = process.env.TRUST_PROXY?.trim().toLowerCase();
  if (trustProxy === 'true' || trustProxy === '1') {
    app.set('trust proxy', 1);
  }

  // Stripe webhooks require the exact raw request body for signature verification.
  app.use(
    json({
      verify: (req: RawBodyRequest<IncomingMessage>, _res, buf) => {
        if (Buffer.isBuffer(buf)) {
          req.rawBody = buf;
        }
      },
    }),
  );
  app.use(urlencoded({ extended: true }));
  const allowedOrigins = getAllowedOrigins(process.env.CORS_ORIGINS);
  app.enableCors({
    // Native clients do not rely on browser CORS. Production browser clients
    // must be explicitly listed, preventing any random website from calling
    // authenticated endpoints with a user's browser session.
    origin:
      allowedOrigins.length > 0
        ? allowedOrigins
        : process.env.NODE_ENV === 'production'
          ? false
          : true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  });
  app.setGlobalPrefix('api'); // api ...///
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      validationError: {
        target: false,
        value: false,
      },
    }),
  );

  const uploadRouter = createUploadRouter(app.get(UploadAuthorizationService));

  app.use(
    '/api/uploadthing',
    createRouteHandler({
      router: uploadRouter,
      config: {
        token: process.env.UPLOADTHING_TOKEN!,
      },
    }),
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');

  console.log(`Api is running on http://localhost:${port}`);
  console.log(`LAN access: http://<your-ip>:${port}/api`);
}
void bootstrap();
