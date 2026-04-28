import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IcdModule } from '../icd/icd.module';
import { ProfessionalModule } from '../professional/professional.module';
import { PatientController } from './patient.controller';
import { PatientService } from './patient.service';
import { PatientEntity } from './entities/patient.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PatientEntity]), IcdModule, ProfessionalModule],
  controllers: [PatientController],
  providers: [PatientService],
  exports: [PatientService, TypeOrmModule],
})
export class PatientModule {}
