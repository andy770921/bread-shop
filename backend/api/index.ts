import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Request, Response } from 'express';

let app: NestExpressApplication;

async function bootstrap() {
  if (!app) {
    app = await NestFactory.create<NestExpressApplication>(AppModule);

    app.enableCors({
      origin: true,
      credentials: true,
    });

    await app.init();
  }
  return app;
}

export default async function handler(req: Request, res: Response) {
  const app = await bootstrap();
  const expressApp = app.getHttpAdapter().getInstance();
  return expressApp(req, res);
}
