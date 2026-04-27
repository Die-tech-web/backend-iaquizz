import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { QuizQuestionType } from '../../common/enums/quiz.enum';
import { PatientLanguage } from '../../common/enums/language.enum';
import { QuizEntity } from './quiz.entity';

type LocalizedTextMap = Partial<Record<PatientLanguage, string>>;

export type QuizQuestionOption = {
  code: string;
  label: string;
  labelI18n?: LocalizedTextMap;
  isCorrect?: boolean;
  imageUrl?: string | null;
  imageAlt?: string | null;
  imageAltI18n?: LocalizedTextMap;
};

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

  @Column({ type: 'jsonb', default: () => "'{}'" })
  textI18n: LocalizedTextMap;

  @Column({ type: 'text', nullable: true })
  promptText: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  promptTextI18n: LocalizedTextMap;

  @Column({ type: 'text', nullable: true })
  audioText: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  audioTextI18n: LocalizedTextMap;

  @Column({ type: 'text', nullable: true })
  imageUrl: string | null;

  @Column({ type: 'text', nullable: true })
  imageAlt: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  imageAltI18n: LocalizedTextMap;

  @Column({ type: 'boolean', default: false })
  isSensitiveMedical: boolean;

  @Column({ type: 'enum', enum: QuizQuestionType })
  type: QuizQuestionType;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  options: QuizQuestionOption[];

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 1 })
  weight: number;
}
