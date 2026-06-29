import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ForbiddenException } from '@nestjs/common';
import { AppModule } from '../app.module';
import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';

describe('CSRF Protection E2E Verification', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should allow GET requests without CSRF headers but set XSRF-TOKEN cookie', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    const rawCookies = response.headers['set-cookie'];
    const cookies = Array.isArray(rawCookies) ? rawCookies : (rawCookies ? [rawCookies] : []);
    const hasXsrf = cookies.some((c: string) => c.includes('XSRF-TOKEN='));
    expect(hasXsrf).toBe(true);
  });

  it('should block modifying POST requests (e.g., /api/datasets) with 403 if XSRF cookie exists but X-XSRF-TOKEN header is missing', async () => {
    // 1. Get the XSRF token cookie via GET request
    const getRes = await request(app.getHttpServer()).get('/health');
    const rawCookies = getRes.headers['set-cookie'];
    const cookies = Array.isArray(rawCookies) ? rawCookies : (rawCookies ? [rawCookies] : []);
    const xsrfCookie = cookies.find((c: string) => c.includes('XSRF-TOKEN='));
    expect(xsrfCookie).toBeDefined();

    const cookieVal = xsrfCookie!.split(';')[0];

    // 2. Perform POST request without X-XSRF-TOKEN header
    await request(app.getHttpServer())
      .post('/datasets')
      .set('Cookie', [cookieVal])
      .send({ name: 'test-csrf', type: 'tabular' })
      .expect(403);
  });

  it('should bypass CSRF and allow requests to succeed (or return 401 due to auth, not 403 CSRF block) when matching cookie and X-XSRF-TOKEN header are supplied', async () => {
    // 1. Get the XSRF token cookie via GET request
    const getRes = await request(app.getHttpServer()).get('/health');
    const rawCookies = getRes.headers['set-cookie'];
    const cookies = Array.isArray(rawCookies) ? rawCookies : (rawCookies ? [rawCookies] : []);
    const xsrfCookie = cookies.find((c: string) => c.includes('XSRF-TOKEN='));
    
    const cookieVal = xsrfCookie!.split(';')[0];
    const token = cookieVal.split('=')[1];

    // 2. Perform POST request with matching header -> should pass CSRF and reach AuthGuard (returns 401)
    await request(app.getHttpServer())
      .post('/datasets')
      .set('Cookie', [cookieVal])
      .set('x-xsrf-token', token)
      .send({ name: 'test-csrf', type: 'tabular' })
      .expect(401); // 401 Unauthorized shows CSRF guard was successfully bypassed!
  });

  it('should block modifying POST requests (e.g., /api/datasets) with 403 if X-XSRF-TOKEN header does not match cookie', async () => {
    const getRes = await request(app.getHttpServer()).get('/health');
    const rawCookies = getRes.headers['set-cookie'];
    const cookies = Array.isArray(rawCookies) ? rawCookies : (rawCookies ? [rawCookies] : []);
    const xsrfCookie = cookies.find((c: string) => c.includes('XSRF-TOKEN='));
    expect(xsrfCookie).toBeDefined();

    const cookieVal = xsrfCookie!.split(';')[0];

    await request(app.getHttpServer())
      .post('/datasets')
      .set('Cookie', [cookieVal])
      .set('x-xsrf-token', 'wrong_csrf_token_val_123')
      .send({ name: 'test-csrf', type: 'tabular' })
      .expect(403);
  });

  it('should bypass CSRF check completely for auth endpoints (e.g., /auth/nonce)', async () => {
    await request(app.getHttpServer())
      .post('/auth/nonce')
      .send({ walletAddress: '0x89abcdef0123456789abcdef0123456789abcdef0123456789abcdef01234567' })
      .expect(200);
  });
});
