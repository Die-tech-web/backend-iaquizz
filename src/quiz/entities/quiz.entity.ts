import {
  Column,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import {
  QuizLevel,
  QuizStatus,
  QuizTheme,
} from '../../common/enums/quiz.enum';
import { PatientProfile } from '../../common/enums/patient.enum';
import { MedicalTopicEntity } from '../../icd/entities/medical-topic.entity';
import { QuizQuestionEntity } from './quiz-question.entity';
import { QuizAttemptEntity } from './quiz-attempt.entity';

@Entity('quizzes')
@Unique(['slug'])
export class QuizEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 120 })
  title: string;

  @Column({ length: 140 })
  slug: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'enum', enum: QuizStatus, default: QuizStatus.DRAFT })
  status: QuizStatus;

  @Column({ type: 'enum', enum: QuizLevel })
  level: QuizLevel;

  @Column({ type: 'enum', enum: QuizTheme, array: true, default: '{}' })
  themes: QuizTheme[];

  @Column({ type: 'enum', enum: PatientProfile, array: true, default: '{}' })
  targetProfiles: PatientProfile[];

  @Column({ type: 'boolean', default: false })
  supportsDialysisContext: boolean;

  @ManyToOne(() => MedicalTopicEntity, (topic) => topic.quizzes, {
    nullable: false,
    eager: true,
  })
  @JoinColumn({ name: 'main_topic_id' })
  mainTopic: MedicalTopicEntity;

  @ManyToMany(() => MedicalTopicEntity, { eager: true })
  @JoinTable({
    name: 'quiz_related_topics',
    joinColumn: { name: 'quiz_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'topic_id', referencedColumnName: 'id' },
  })
  relatedTopics: MedicalTopicEntity[];

  @OneToMany(() => QuizQuestionEntity, (question) => question.quiz, {
    cascade: true,
  })
  questions: QuizQuestionEntity[];

  @OneToMany(() => QuizAttemptEntity, (attempt) => attempt.quiz)
  attempts: QuizAttemptEntity[];
}
