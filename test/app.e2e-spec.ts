import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { MedicalTopicKey } from '../src/common/enums/medical-topic.enum';
import { PatientProfile } from '../src/common/enums/patient.enum';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  let accessToken: string;
  let patientId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    const email = `e2e.analysis.${Date.now()}@akacare.app`;
    const registerResponse = await request(app.getHttpServer())
      .post('/auth/register-patient')
      .send({
        email,
        password: 'Akacare@123',
        firstName: 'E2E',
        lastName: 'Analysis',
        profile: PatientProfile.CHRONIC,
        conditionKeys: [
          MedicalTopicKey.CHRONIC_KIDNEY_DISEASE,
          MedicalTopicKey.DIABETES,
        ],
      })
      .expect(201);

    accessToken = registerResponse.body.accessToken;
    patientId = registerResponse.body.patient.id;
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('GET /analysis/recommendations/patient/:patientId (legacy)', async () => {
    const response = await request(app.getHttpServer())
      .get(`/analysis/recommendations/patient/${patientId}`)
      .query({ dominantDisease: MedicalTopicKey.CHRONIC_KIDNEY_DISEASE })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThan(0);
    expect(response.body[0]).toEqual(
      expect.objectContaining({
        quizId: expect.any(String),
        title: expect.any(String),
        level: expect.any(String),
        mainTopic: expect.any(String),
        relatedTopics: expect.any(Array),
        scoreHint: expect.any(Number),
      }),
    );
  });

  it('GET /analysis/recommendations-v2/patient/:patientId', async () => {
    const response = await request(app.getHttpServer())
      .get(`/analysis/recommendations-v2/patient/${patientId}`)
      .query({
        dominantDisease: MedicalTopicKey.CHRONIC_KIDNEY_DISEASE,
        limit: 3,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        patientId,
        patientProfile: expect.any(String),
        dominantDisease: MedicalTopicKey.CHRONIC_KIDNEY_DISEASE,
        generatedAt: expect.any(String),
        totalCandidates: expect.any(Number),
        recommendations: expect.any(Array),
      }),
    );
    expect(response.body.recommendations.length).toBeLessThanOrEqual(3);
    expect(response.body.recommendations[0]).toEqual(
      expect.objectContaining({
        quizId: expect.any(String),
        title: expect.any(String),
        level: expect.any(String),
        mainTopic: expect.any(String),
        relatedTopics: expect.any(Array),
        targetProfiles: expect.any(Array),
        relevanceScore: expect.any(Number),
        scoreHint: expect.any(Number),
        reasons: expect.any(Array),
        matchedTopics: expect.any(Array),
      }),
    );
  });

  afterAll(async () => {
    await app.close();
  });
});
