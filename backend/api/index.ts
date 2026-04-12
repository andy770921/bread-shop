import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { Request, Response } from 'express';

let app: NestExpressApplication;

async function bootstrap() {
  if (!app) {
    app = await NestFactory.create<NestExpressApplication>(AppModule);

    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

    app.enableCors({
      origin: true,
      credentials: true,
    });

    // Swagger configuration (identical to main.ts)
    const config = new DocumentBuilder()
      .setTitle('NestJS Backend API')
      .setDescription('API documentation for fullstack boilerplate')
      .setVersion('1.0')
      .addTag('api', 'Core API endpoints')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('/', app, document, {
      customSiteTitle: 'Backend API Documentation',
      customfavIcon: 'https://nestjs.com/favicon.ico',
      customCssUrl: 'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui.min.css',
      customJs: [
        'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui-bundle.min.js',
        'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui-standalone-preset.min.js',
      ],
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
