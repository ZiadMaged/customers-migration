import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/shared/filters/all-exceptions.filter';
import { SourceSystem } from '../src/customer/domain/enums/source-system.enum';

const TEST_PORT = 4567;

describe('Customer Service (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // Set PORT so System B client points to our mock API
    process.env.PORT = String(TEST_PORT);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.listen(TEST_PORT);

    // Wait for seeder to populate data
    await new Promise((resolve) => setTimeout(resolve, 1500));
  });

  afterAll(async () => {
    await app.close();
    delete process.env.PORT;
  });

  describe('GET /customer/:email', () => {
    it('should return a merged customer when found in both systems', async () => {
      const res = await request(app.getHttpServer())
        .get('/customer/max.mustermann@example.de')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe('max.mustermann@example.de');
      expect(res.body.data._metadata.sources).toContain(SourceSystem.SYSTEM_A);
      expect(res.body.data._metadata.sources).toContain(SourceSystem.SYSTEM_B);
      expect(res.body.data.identifiers.systemAId).toBeDefined();
      expect(res.body.data.identifiers.systemBUuid).toBeDefined();
      expect(res.body.timestamp).toBeDefined();
    });

    it('should return 404 for unknown email', async () => {
      const res = await request(app.getHttpServer())
        .get('/customer/notfound@example.de')
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.error.statusCode).toBe(404);
      expect(res.body.error.message).toContain('not found');
    });

    it('should normalize email casing', async () => {
      const res = await request(app.getHttpServer())
        .get('/customer/Max.Mustermann@Example.DE')
        .expect(200);

      expect(res.body.data.email).toBe('max.mustermann@example.de');
    });

    it('should return single-source result for System A-only customer', async () => {
      const res = await request(app.getHttpServer())
        .get('/customer/jan.schmidt@example.de')
        .expect(200);

      expect(res.body.data._metadata.sources).toEqual([SourceSystem.SYSTEM_A]);
      expect(res.body.data.identifiers.systemBUuid).toBeNull();
    });

    it('should return single-source result for System B-only customer', async () => {
      const res = await request(app.getHttpServer())
        .get('/customer/lisa.neu@example.de')
        .expect(200);

      expect(res.body.data._metadata.sources).toEqual([SourceSystem.SYSTEM_B]);
      expect(res.body.data.identifiers.systemAId).toBeNull();
    });
  });

  describe('GET /customer/search', () => {
    it('should return matching customers', async () => {
      const res = await request(app.getHttpServer())
        .get('/customer/search?q=Mustermann')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0].email).toContain('mustermann');
    });

    it('should return empty array for no matches', async () => {
      const res = await request(app.getHttpServer())
        .get('/customer/search?q=zzzznonexistent')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
    });

    it('should return 400 when query is too short', async () => {
      const res = await request(app.getHttpServer())
        .get('/customer/search?q=x')
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error.statusCode).toBe(400);
    });

    it('should return 400 when query is missing', async () => {
      await request(app.getHttpServer()).get('/customer/search').expect(400);
    });
  });

  describe('POST /customer/sync', () => {
    it('should detect conflicts between systems', async () => {
      const res = await request(app.getHttpServer())
        .post('/customer/sync')
        .send({ email: 'sophie.mueller@example.de' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe('sophie.mueller@example.de');
      expect(res.body.data.status).toBe('conflicts_found');
      expect(res.body.data.conflicts.length).toBeGreaterThan(0);
    });

    it('should return single_source_only for System A-only email', async () => {
      // jan.schmidt only exists in System A
      const res = await request(app.getHttpServer())
        .post('/customer/sync')
        .send({ email: 'jan.schmidt@example.de' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('single_source_only');
      expect(res.body.data.presentIn).toBe(SourceSystem.SYSTEM_A);
    });

    it('should return 404 for unknown email', async () => {
      const res = await request(app.getHttpServer())
        .post('/customer/sync')
        .send({ email: 'nobody@example.de' })
        .expect(404);

      expect(res.body.success).toBe(false);
    });

    it('should return 400 for invalid email format', async () => {
      const res = await request(app.getHttpServer())
        .post('/customer/sync')
        .send({ email: 'not-an-email' })
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /health', () => {
    it('should return healthy status', async () => {
      const res = await request(app.getHttpServer()).get('/health').expect(200);

      expect(res.body.status).toBe('ok');
    });
  });
});
