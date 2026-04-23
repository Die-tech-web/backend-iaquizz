import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { QuizModule } from '../quiz/quiz.module';
import { FhirController } from './fhir.controller';
import { FhirService } from './fhir.service';

@Module({
  imports: [HttpModule, QuizModule],
  controllers: [FhirController],
  providers: [FhirService],
  exports: [FhirService],
})
export class FhirModule {}
