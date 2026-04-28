import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IcdModule } from '../icd/icd.module';
import { NotificationModule } from '../notification/notification.module';
import { PatientModule } from '../patient/patient.module';
import { QuizController } from './quiz.controller';
import { QuizService } from './quiz.service';
import { QuizLevelAdaptationService } from './quiz-level-adaptation.service';
import { QuizLocalizationService } from './quiz-localization.service';
import { QuizAnswerEntity } from './entities/quiz-answer.entity';
import { QuizAttemptEntity } from './entities/quiz-attempt.entity';
import { PatientProgressionEntity } from './entities/patient-progression.entity';
import { QuizEntity } from './entities/quiz.entity';
import { QuizQuestionEntity } from './entities/quiz-question.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      QuizEntity,
      QuizQuestionEntity,
      QuizAttemptEntity,
      QuizAnswerEntity,
      PatientProgressionEntity,
    ]),
    IcdModule,
    PatientModule,
    NotificationModule,
  ],
  controllers: [QuizController],
  providers: [QuizService, QuizLevelAdaptationService, QuizLocalizationService],
  exports: [QuizService, TypeOrmModule],
})
export class QuizModule {}
