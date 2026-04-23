import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IcdController } from './icd.controller';
import { IcdService } from './icd.service';
import { DiseaseCorrelationEntity } from './entities/disease-correlation.entity';
import { MedicalTopicEntity } from './entities/medical-topic.entity';

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([MedicalTopicEntity, DiseaseCorrelationEntity]),
  ],
  controllers: [IcdController],
  providers: [IcdService],
  exports: [IcdService, TypeOrmModule],
})
export class IcdModule {}
