import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { QuizQuestionType } from '../../common/enums/quiz.enum';
import { QuizEntity } from './quiz.entity';

@Entity('quiz_questions')
export class QuizQuestionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => QuizEntity, (quiz) => quiz.questions, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'quiz_id' })
  quiz: QuizEntity;

  @Column({ length: 48 })
  linkId: string;

  @Column({ type: 'text' })
  text: string;

  @Column({ type: 'enum', enum: QuizQuestionType })
  type: QuizQuestionType;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  options: Array<{ code: string; label: string; isCorrect?: boolean }>;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 1 })
  weight: number;
}
