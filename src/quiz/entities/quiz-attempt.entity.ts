import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { QuizAttemptStatus, QuizLevel } from '../../common/enums/quiz.enum';
import { PatientEntity } from '../../patient/entities/patient.entity';
import { QuizEntity } from './quiz.entity';
import { QuizAnswerEntity } from './quiz-answer.entity';

@Entity('quiz_attempts')
export class QuizAttemptEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => PatientEntity, (patient) => patient.attempts, {
    nullable: false,
    eager: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'patient_id' })
  patient: PatientEntity;

  @ManyToOne(() => QuizEntity, (quiz) => quiz.attempts, {
    nullable: false,
    eager: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'quiz_id' })
  quiz: QuizEntity;

  @Column({ type: 'enum', enum: QuizAttemptStatus, default: QuizAttemptStatus.IN_PROGRESS })
  status: QuizAttemptStatus;

  @Column({ type: 'enum', enum: QuizLevel, default: QuizLevel.BEGINNER })
  levelAtAttempt: QuizLevel;

  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true })
  score: number | null;

  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true })
  maxScore: number | null;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  startedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @OneToMany(() => QuizAnswerEntity, (answer) => answer.attempt, { cascade: true, eager: true })
  answers: QuizAnswerEntity[];
}
