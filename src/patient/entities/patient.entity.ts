import {
  Column,
  Entity,
  JoinTable,
  ManyToMany,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { BiologicalSex, PatientProfile } from '../../common/enums/patient.enum';
import { MedicalTopicEntity } from '../../icd/entities/medical-topic.entity';
import { QuizAttemptEntity } from '../../quiz/entities/quiz-attempt.entity';

@Entity('patients')
@Unique(['email'])
export class PatientEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  externalRef: string | null;

  @Column({ type: 'varchar', length: 180, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, select: true })
  passwordHash: string | null;

  @Column({ length: 80 })
  firstName: string;

  @Column({ length: 80 })
  lastName: string;

  @Column({ type: 'date', nullable: true })
  birthDate: string | null;

  @Column({ type: 'enum', enum: BiologicalSex, default: BiologicalSex.UNKNOWN })
  sex: BiologicalSex;

  @Column({ type: 'enum', enum: PatientProfile, default: PatientProfile.STANDARD })
  profile: PatientProfile;

  @ManyToMany(() => MedicalTopicEntity, { eager: true })
  @JoinTable({
    name: 'patient_conditions',
    joinColumn: { name: 'patient_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'topic_id', referencedColumnName: 'id' },
  })
  conditions: MedicalTopicEntity[];

  @OneToMany(() => QuizAttemptEntity, (attempt) => attempt.patient)
  attempts: QuizAttemptEntity[];
}
