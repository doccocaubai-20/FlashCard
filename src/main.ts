import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Increase body limit to support base64 avatar images
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ limit: '10mb', extended: true }));

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const isAllowed =
        origin === 'http://localhost:5173' ||
        origin === 'htpps://chongziapp.id.vn' ||
        origin === 'https://www.chongziapp.id.vn' ||
        origin.endsWith('.vercel.app') ||
        (process.env.FRONTEND_URL && origin === process.env.FRONTEND_URL);

      if (isAllowed) {
        callback(null, true);
      } else {
        callback(null, false); // Block other origins gracefully
      }
    },
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
    }),
  );
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap().catch((err) => {
  console.error(err);
});
