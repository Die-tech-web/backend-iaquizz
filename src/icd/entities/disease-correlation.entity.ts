import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { CorrelationType } from '../../common/enums/correlation.enum';
import { MedicalTopicEntity } from './medical-topic.entity';

@Entity('disease_correlations')
export class DiseaseCorrelationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => MedicalTopicEntity, (topic) => topic.outgoingCorrelations, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'primary_topic_id' })
  primaryTopic: MedicalTopicEntity;

  @ManyToOne(() => MedicalTopicEntity, (topic) => topic.incomingCorrelations, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'correlated_topic_id' })
  correlatedTopic: MedicalTopicEntity;

  @Column({ type: 'enum', enum: CorrelationType })
  type: CorrelationType;

  @Column({ type: 'int', default: 1 })
  priority: number;

  @Column({ type: 'numeric', precision: 4, scale: 2, default: 0.5 })
  strength: number;

  @Column({ type: 'text', nullable: true })
  rationale: string | null;
}
