import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Enable CORS for customer + admin frontends
  const allowedOrigins = [
    process.env.FRONTEND_URL || 'http://localhost:3001',
    process.env.ADMIN_FRONTEND_URL || 'http://localhost:3002',
  ];
  app.enableCors({
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) =>
      !origin || allowedOrigins.includes(origin) ? cb(null, true) : cb(new Error('CORS blocked')),
    credentials: true,
  });

  // Swagger configuration
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
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);

  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
  console.log(`Swagger UI available at: http://localhost:${port}/`);
  console.log(`OpenAPI JSON at: http://localhost:${port}/api-json`);
}
bootstrap();
