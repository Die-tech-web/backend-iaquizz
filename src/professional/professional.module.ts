import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CareTeamAssignmentEntity } from './entities/care-team-assignment.entity';
import { HealthProfessionalEntity } from './entities/health-professional.entity';
import { ProfessionalService } from './professional.service';

@Module({
  imports: [TypeOrmModule.forFeature([HealthProfessionalEntity, CareTeamAssignmentEntity])],
  providers: [ProfessionalService],
  exports: [ProfessionalService, TypeOrmModule],
})
export class ProfessionalModule {}
