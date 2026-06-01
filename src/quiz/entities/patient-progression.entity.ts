import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { QuizLevel, QuizTheme } from '../../common/enums/quiz.enum';
import { PatientEntity } from '../../patient/entities/patient.entity';

@Entity('patient_progressions')
@Unique(['patient'])
export class PatientProgressionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => PatientEntity, (patient) => patient.progression, {
    nullable: false,
    eager: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'patient_id' })
  patient: PatientEntity;

  @Column({ type: 'enum', enum: QuizLevel, default: QuizLevel.BEGINNER })
  currentLevel: QuizLevel;

  @Column({ type: 'enum', enum: QuizTheme, default: QuizTheme.RISK_FACTORS })
  currentModule: QuizTheme;

  @Column({ type: 'enum', enum: QuizLevel, nullable: true })
  nextLevel: QuizLevel | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  validatedModulesByLevel: Record<string, QuizTheme[]>;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  moduleScoresByLevel: Record<string, Record<string, number>>;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  playedQuizIdsByLevelModule: Record<string, Record<string, string[]>>;

  @Column({ type: 'int', default: 0 })
  perfectScoresAtCurrentLevel: number;

  @Column({ type: 'int', default: 0 })
  requiredPerfectScoresForNextLevel: number;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0 })
  progressionPercentage: number;

  @Column({ type: 'int', default: 0 })
  totalCompletedAttempts: number;

  @Column({ type: 'int', default: 0 })
  totalPerfectScores: number;

  @Column({ type: 'timestamptz', nullable: true })
  lastLevelUpAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
