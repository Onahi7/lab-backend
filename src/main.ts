import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters';
import { LoggingInterceptor, AuditLoggingInterceptor } from './common/interceptors';

async function bootstrap() {
  // Create NestJS application with custom logger configuration
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // Enable security headers with Helmet
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
    crossOriginEmbedderPolicy: false, // Allow embedding for development
  }));

  // Enable CORS with enhanced configuration
  const corsOrigin = configService.get('cors.origin');
  app.enableCors({
    origin: corsOrigin,
    credentials: configService.get('cors.credentials'),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['X-Total-Count', 'X-Page', 'X-Per-Page'],
    maxAge: 3600, // Cache preflight requests for 1 hour
  });
  logger.log(`CORS enabled for origin: ${corsOrigin}`);

  // Enable global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Enable global exception filter
  app.useGlobalFilters(new HttpExceptionFilter(configService));

  // Enable global interceptors for logging and monitoring
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new AuditLoggingInterceptor(),
  );

  const port = configService.get('app.port');
  
  // Listen on all network interfaces (0.0.0.0) for LAN access
  await app.listen(port, '0.0.0.0');

  logger.log(`Application is running on: http://localhost:${port}`);
  logger.log(`LAN access available at: http://[YOUR_LAN_IP]:${port}`);
  logger.log(`Find your LAN IP with: ipconfig (Windows) or ifconfig (Mac/Linux)`);
  logger.log(`Environment: ${configService.get('app.nodeEnv')}`);
  logger.log('Logging and monitoring interceptors enabled');
}
void bootstrap();
