import './instrument';
import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe, ForbiddenException } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { LoggingInterceptor } from './logging.interceptor';
import * as express from 'express';
import * as helmet from 'helmet';
import * as compression from 'compression';
import * as cookieParser from 'cookie-parser';
import { v4 as uuidv4 } from 'uuid';

// Global BigInt serializer patch for JSON.stringify
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

/**
 * Validate required environment variables before boot.
 * Fails loudly so deployment errors are obvious.
 */
function validateEnv(): void {
  const required: string[] = [
    'DATABASE_URL',
    'REDIS_URL',
    'JWT_SECRET',
    'SHELBY_MODE',
    'SHELBY_EXPLORER_BASE_URL',
  ];

  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `\n\n❌ DataForge API startup failed — missing required environment variables:\n` +
        missing.map((k) => `   - ${k}`).join('\n') +
        `\n\nPlease check your .env file or deployment environment.\n`
    );
  }
}

async function bootstrap() {
  validateEnv();

  if (process.env.RUN_MODE === 'worker') {
    const app = await NestFactory.createApplicationContext(AppModule);
    Logger.log(`🚀 DataForge worker context initialized successfully.`);
    return;
  }

  const app = await NestFactory.create(AppModule);

  // Parse cookies
  app.use((cookieParser as any)());

  // Security headers via Helmet (CSP, Referrer-Policy, etc.)
  const helmetOptions = {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https://api.dicebear.com'],
        connectSrc: [
          "'self'",
          'https://api-production-e4ad.up.railway.app',
          'https://web-avins-projects-94a43281.vercel.app',
          'http://localhost:3000',
          'http://127.0.0.1:3000',
        ],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  };

  app.use(
    (helmet as any).default
      ? (helmet as any).default(helmetOptions)
      : (helmet as any)(helmetOptions)
  );

  // Permissions-Policy header middleware
  app.use((req: any, res: any, next: () => void) => {
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), interest-cohort=()'
    );
    next();
  });

  // Gzip compression
  app.use((compression as any)());

  // Request ID middleware — attach unique ID to every request and response
  app.use((req: any, res: any, next: () => void) => {
    const requestId = (req.headers['x-request-id'] as string) || uuidv4();
    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);
    next();
  });

  // Strict CORS — dynamically parse FRONTEND_ORIGIN and ADDITIONAL_FRONTEND_ORIGINS
  const allowedOrigins = new Set<string>();
  const addOrigin = (o: string) => {
    if (!o) return;
    const clean = o.trim().replace(/\/$/, '').toLowerCase();
    if (clean) allowedOrigins.add(clean);
  };

  if (process.env.FRONTEND_ORIGIN) {
    addOrigin(process.env.FRONTEND_ORIGIN);
  } else {
    addOrigin('http://localhost:3000');
  }

  if (process.env.ADDITIONAL_FRONTEND_ORIGINS) {
    process.env.ADDITIONAL_FRONTEND_ORIGINS.split(',')
      .forEach(o => addOrigin(o));
  }

  // Always allow localhost in non-production environments
  if (process.env.NODE_ENV !== 'production') {
    addOrigin('http://localhost:3000');
    addOrigin('http://127.0.0.1:3000');
  }

  // Pattern matching check for local development and Vercel deployments
  const isAllowedPattern = (origin: string): boolean => {
    const clean = origin.trim().replace(/\/$/, '').toLowerCase();
    
    // 1. Direct match in allowedOrigins Set
    if (allowedOrigins.has(clean)) {
      return true;
    }
    
    // 2. Localhost and loopback check (with any port)
    const localPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
    if (localPattern.test(clean)) {
      return true;
    }
    
    // 3. Vercel deployment check: all *.vercel.app origins
    const vercelPattern = /^https:\/\/([a-zA-Z0-9-]+\.)*vercel\.app$/;
    if (vercelPattern.test(clean)) {
      return true;
    }
    
    return false;
  };

  Logger.log(`Allowed CORS static origins: ${Array.from(allowedOrigins).join(', ')}`);

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      const cleanOrigin = origin.trim().replace(/\/$/, '');
      if (isAllowedPattern(cleanOrigin)) {
        callback(null, true);
      } else {
        Logger.warn(`CORS blocked for unauthorized origin: ${origin}`);
        callback(new ForbiddenException(`Origin ${origin} not allowed by CORS`), false);
      }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    exposedHeaders: ['x-request-id'],
  });

  // Enable ValidationPipe
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true
  }));

  // Global Prefix
  app.setGlobalPrefix('api');

  // JSON body limit: 1MB (file uploads use multipart, not JSON)
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ limit: '1mb', extended: true }));

  // Global Logging Interceptor — structured request logs
  app.useGlobalInterceptors(new LoggingInterceptor());



  const port = process.env.PORT || 4000;
  await app.listen(port, '0.0.0.0');
  Logger.log(`🚀 DataForge API is running on: http://0.0.0.0:${port}/api`);
}
bootstrap();

