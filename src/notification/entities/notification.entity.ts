import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import {
  NotificationStatus,
  NotificationType,
} from '../../common/enums/notification.enum';
import { PatientEntity } from '../../patient/entities/patient.entity';
import { HealthProfessionalEntity } from '../../professional/entities/health-professional.entity';
import { QuizAttemptEntity } from '../../quiz/entities/quiz-attempt.entity';

@Entity('notifications')
@Unique(['recipient', 'attempt', 'type'])
export class NotificationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => HealthProfessionalEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'recipient_professional_id' })
  recipient: HealthProfessionalEntity;

  @ManyToOne(() => PatientEntity, { nullable: false, onDelete: 'CASCADE', eager: true })
  @JoinColumn({ name: 'patient_id' })
  patient: PatientEntity;

  @ManyToOne(() => QuizAttemptEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'attempt_id' })
  attempt: QuizAttemptEntity;

  @Column({ type: 'enum', enum: NotificationType })
  type: NotificationType;

  @Column({ type: 'enum', enum: NotificationStatus, default: NotificationStatus.UNREAD })
  status: NotificationStatus;

  @Column({ type: 'varchar', length: 180 })
  title: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'numeric', precision: 4, scale: 2 })
  scoreOnTen: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  actionLink: string | null;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  readAt: Date | null;
}
