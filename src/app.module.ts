import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalysisModule } from './analysis/analysis.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { typeOrmConfig } from './database/typeorm.config';
import { FhirModule } from './fhir/fhir.module';
import { IcdModule } from './icd/icd.module';
import { PatientModule } from './patient/patient.module';
import { QuizModule } from './quiz/quiz.module';
import { AuthModule } from './auth/auth.module';
import { NotificationModule } from './notification/notification.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { TtsModule } from './tts/tts.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync(typeOrmConfig),
    IcdModule,
    PatientModule,
    QuizModule,
    AnalysisModule,
    FhirModule,
    AuthModule,
    NotificationModule,
    TtsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
