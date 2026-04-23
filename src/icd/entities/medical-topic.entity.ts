import {
  Column,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import {
  MedicalTopicKey,
  MedicalTopicType,
} from '../../common/enums/medical-topic.enum';
import { DiseaseCorrelationEntity } from './disease-correlation.entity';
import { QuizEntity } from '../../quiz/entities/quiz.entity';

@Entity('medical_topics')
@Unique(['key'])
export class MedicalTopicEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: MedicalTopicKey })
  key: MedicalTopicKey;

  @Column({ type: 'enum', enum: MedicalTopicType })
  type: MedicalTopicType;

  @Column({ length: 120 })
  label: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  icd11Code: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @OneToMany(() => DiseaseCorrelationEntity, (correlation) => correlation.primaryTopic)
  outgoingCorrelations: DiseaseCorrelationEntity[];

  @OneToMany(() => DiseaseCorrelationEntity, (correlation) => correlation.correlatedTopic)
  incomingCorrelations: DiseaseCorrelationEntity[];

  @OneToMany(() => QuizEntity, (quiz) => quiz.mainTopic)
  quizzes: QuizEntity[];
}
