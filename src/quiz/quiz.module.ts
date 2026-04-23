import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IcdModule } from '../icd/icd.module';
import { PatientModule } from '../patient/patient.module';
import { QuizController } from './quiz.controller';
import { QuizService } from './quiz.service';
import { QuizAnswerEntity } from './entities/quiz-answer.entity';
import { QuizAttemptEntity } from './entities/quiz-attempt.entity';
import { QuizEntity } from './entities/quiz.entity';
import { QuizQuestionEntity } from './entities/quiz-question.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      QuizEntity,
      QuizQuestionEntity,
      QuizAttemptEntity,
      QuizAnswerEntity,
    ]),
    IcdModule,
    PatientModule,
  ],
  controllers: [QuizController],
  providers: [QuizService],
  exports: [QuizService, TypeOrmModule],
})
export class QuizModule {}
