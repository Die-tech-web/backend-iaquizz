import { Module } from '@nestjs/common';
import { IcdModule } from '../icd/icd.module';
import { QuizModule } from '../quiz/quiz.module';
import { AnalysisController } from './analysis.controller';
import { AnalysisService } from './analysis.service';

@Module({
  imports: [IcdModule, QuizModule],
  controllers: [AnalysisController],
  providers: [AnalysisService],
})
export class AnalysisModule {}
