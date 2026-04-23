import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? 3000);
  const host =
    process.env.HOST ??
    (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
  const localSwaggerServer =
    process.env.SWAGGER_LOCAL_SERVER_URL ?? `http://localhost:${port}`;
  const productionSwaggerServer =
    process.env.SWAGGER_PRODUCTION_SERVER_URL ??
    'https://your-render-service.onrender.com';
  app.enableCors({
    origin: true,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Aka Care IA Quiz API')
    .setDescription(
      'API e-sante pour quiz medicaux, correlations ICD-11 et mapping HL7 FHIR.',
    )
    .setVersion('1.0.0')
    .addServer(localSwaggerServer, 'Local')
    .addServer(productionSwaggerServer, 'Production (Render)')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        in: 'header',
        description: 'Entrer: Bearer <token>',
      },
      'JWT-auth',
    )
    .build();

  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDocument, {
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'none',
    },
    customSiteTitle: 'Aka Care API Docs',
  });

  await app.listen(port, host);

  const displayHost = host === '127.0.0.1' ? 'localhost' : host;
  const baseUrl = `http://${displayHost}:${port}`;
  logger.log(`API ready: ${baseUrl}`);
  logger.log(`Swagger UI: ${baseUrl}/docs`);
  logger.log(`OpenAPI JSON: ${baseUrl}/docs-json`);
}

void bootstrap();
