import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IcdModule } from '../icd/icd.module';
import { PatientController } from './patient.controller';
import { PatientService } from './patient.service';
import { PatientEntity } from './entities/patient.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PatientEntity]), IcdModule],
  controllers: [PatientController],
  providers: [PatientService],
  exports: [PatientService, TypeOrmModule],
})
export class PatientModule {}
