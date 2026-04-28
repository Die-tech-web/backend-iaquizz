import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { PatientEntity } from '../../patient/entities/patient.entity';
import { HealthProfessionalEntity } from './health-professional.entity';

@Entity('care_team_assignments')
@Unique(['patient', 'professional'])
export class CareTeamAssignmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => PatientEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'patient_id' })
  patient: PatientEntity;

  @ManyToOne(() => HealthProfessionalEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'professional_id' })
  professional: HealthProfessionalEntity;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  lastAssignedAt: Date | null;
}
