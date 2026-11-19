import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { loadConfig } from './config';
import { loadEnvFile } from './env';

async function bootstrap(): Promise<void> {
  loadEnvFile();
  const config = loadConfig();
  // rawBody keeps the exact bytes Paystack signed; the JSON parser still
  // populates request.body for every other route.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.enableCors({
    origin: config.allowedOrigin,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['content-type', 'x-paystack-signature'],
    maxAge: 86_400,
  });
  const document = new DocumentBuilder()
    .setTitle('AnalytIQ Cloud API')
    .setDescription('Plans, Paystack checkout and license issuance')
    .setVersion('0.1.0')
    .build();
  const swagger = SwaggerModule.createDocument(app, document);
  SwaggerModule.setup('docs', app, swagger);
  const port = Number(process.env.PORT ?? 3002);
  await app.listen(port);
}

// eslint-disable-next-line no-console
void bootstrap().catch((err: unknown) => console.error(err));
