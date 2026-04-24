import { Module } from '@nestjs/common';
import { IcdModule } from '../icd/icd.module';
import { QuizModule } from '../quiz/quiz.module';
import { PatientModule } from '../patient/patient.module';
import { AnalysisController } from './analysis.controller';
import { AnalysisService } from './analysis.service';
import { RecommendationScoringService } from './recommendation/recommendation-scoring.service';

@Module({
  imports: [IcdModule, QuizModule, PatientModule],
  controllers: [AnalysisController],
  providers: [AnalysisService, RecommendationScoringService],
})
export class AnalysisModule {}
