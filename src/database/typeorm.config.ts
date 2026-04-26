import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleAsyncOptions } from '@nestjs/typeorm';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { MedicalTopicEntity } from '../icd/entities/medical-topic.entity';
import { DiseaseCorrelationEntity } from '../icd/entities/disease-correlation.entity';
import { QuizEntity } from '../quiz/entities/quiz.entity';
import { QuizQuestionEntity } from '../quiz/entities/quiz-question.entity';
import { QuizAttemptEntity } from '../quiz/entities/quiz-attempt.entity';
import { QuizAnswerEntity } from '../quiz/entities/quiz-answer.entity';
import { PatientProgressionEntity } from '../quiz/entities/patient-progression.entity';
import { PatientEntity } from '../patient/entities/patient.entity';

function envToBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }

  return value.toLowerCase() === 'true';
}

export const typeOrmConfig: TypeOrmModuleAsyncOptions = {
  inject: [ConfigService],
  useFactory: (configService: ConfigService): TypeOrmModuleOptions => {
    const synchronize = envToBoolean(configService.get<string>('DB_SYNC'), true);
    const logging = envToBoolean(configService.get<string>('DB_LOGGING'), false);
    const databaseUrl = configService.get<string>('DATABASE_URL');
    const dbSsl = envToBoolean(configService.get<string>('DB_SSL'), false);
    const dbSslRejectUnauthorized = envToBoolean(
      configService.get<string>('DB_SSL_REJECT_UNAUTHORIZED'),
      false,
    );

    const baseConfig: TypeOrmModuleOptions = {
      type: 'postgres',
      entities: [
        MedicalTopicEntity,
        DiseaseCorrelationEntity,
        QuizEntity,
        QuizQuestionEntity,
        QuizAttemptEntity,
        QuizAnswerEntity,
        PatientProgressionEntity,
        PatientEntity,
      ],
      synchronize,
      autoLoadEntities: false,
      logging,
      ssl: dbSsl
        ? {
            rejectUnauthorized: dbSslRejectUnauthorized,
          }
        : false,
    };

    if (databaseUrl) {
      return {
        ...baseConfig,
        url: databaseUrl,
      };
    }

    return {
      ...baseConfig,
      host: configService.get<string>('DB_HOST', '127.0.0.1'),
      port: Number(configService.get<string>('DB_PORT', '5432')),
      username: configService.get<string>('DB_USER', 'postgres'),
      password: configService.get<string>('DB_PASSWORD', 'ebeno'),
      database: configService.get<string>('DB_NAME', 'aka_care_quiz'),
    };
  },
};
