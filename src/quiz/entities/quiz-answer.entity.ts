import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { QuizAttemptEntity } from './quiz-attempt.entity';
import { QuizQuestionEntity } from './quiz-question.entity';

@Entity('quiz_answers')
export class QuizAnswerEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => QuizAttemptEntity, (attempt) => attempt.answers, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'attempt_id' })
  attempt: QuizAttemptEntity;

  @ManyToOne(() => QuizQuestionEntity, { nullable: false, eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'question_id' })
  question: QuizQuestionEntity;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  value: string[];

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0 })
  points: number;
}
