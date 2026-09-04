import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded } from 'express';
import type { IncomingMessage } from 'http';
import { createRouteHandler } from 'uploadthing/express';

import { AppModule } from './app.module';
import { uploadRouter } from './uploadthing/upload-router';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });

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
  app.enableCors();
  app.setGlobalPrefix('api'); // api ...///
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

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
