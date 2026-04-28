import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationEntity } from './entities/notification.entity';
import {
  NotificationStatus,
  NotificationType,
} from '../common/enums/notification.enum';
import { PatientEntity } from '../patient/entities/patient.entity';
import { QuizAttemptEntity } from '../quiz/entities/quiz-attempt.entity';
import { ProfessionalService } from '../professional/professional.service';
import { ListMyNotificationsDto } from './dto/list-my-notifications.dto';

@Injectable()
export class NotificationService {
  private static readonly CRITICAL_SCORE_THRESHOLD = 5;

  constructor(
    @InjectRepository(NotificationEntity)
    private readonly notificationRepository: Repository<NotificationEntity>,
    private readonly professionalService: ProfessionalService,
  ) {}

  async createCriticalQuizNotifications(params: {
    patient: PatientEntity;
    attempt: QuizAttemptEntity;
    scoreOnTen: number;
  }) {
    if (params.scoreOnTen >= NotificationService.CRITICAL_SCORE_THRESHOLD) {
      return [];
    }

    const recipients = await this.professionalService.findRecipientsForPatient(
      params.patient.id,
    );

    if (!recipients.length) {
      return [];
    }

    const rows = recipients.map((recipient) =>
      this.notificationRepository.create({
        recipient,
        patient: params.patient,
        attempt: params.attempt,
        type: NotificationType.QUIZ_CRITICAL,
        status: NotificationStatus.UNREAD,
        title: 'Quiz critique détecté',
        message: `Le patient ${params.patient.firstName} ${params.patient.lastName} a obtenu ${params.scoreOnTen}/10.`,
        scoreOnTen: Number(params.scoreOnTen.toFixed(2)),
        actionLink: `/professional/patients/${params.patient.id}?attemptId=${params.attempt.id}`,
      }),
    );

    try {
      return await this.notificationRepository.save(rows);
    } catch {
      // Ignore duplicate inserts protected by unique constraint.
      return [];
    }
  }

  async listForProfessional(
    professionalId: string,
    query: ListMyNotificationsDto = {},
  ) {
    const limit = query.limit ?? 20;
    const qb = this.notificationRepository
      .createQueryBuilder('notification')
      .leftJoinAndSelect('notification.patient', 'patient')
      .leftJoinAndSelect('notification.attempt', 'attempt')
      .where('notification.recipient_professional_id = :professionalId', {
        professionalId,
      })
      .orderBy('notification.createdAt', 'DESC')
      .take(limit);

    if (query.unreadOnly) {
      qb.andWhere('notification.status = :status', {
        status: NotificationStatus.UNREAD,
      });
    }

    const items = await qb.getMany();
    const unreadCount = await this.notificationRepository.count({
      where: {
        recipient: { id: professionalId },
        status: NotificationStatus.UNREAD,
      },
    });

    return {
      unreadCount,
      items: items.map((notification) => ({
        id: notification.id,
        type: notification.type,
        status: notification.status,
        title: notification.title,
        message: notification.message,
        scoreOnTen: Number(notification.scoreOnTen),
        actionLink: notification.actionLink,
        createdAt: notification.createdAt,
        readAt: notification.readAt,
        patient: {
          id: notification.patient.id,
          firstName: notification.patient.firstName,
          lastName: notification.patient.lastName,
          email: notification.patient.email,
          currentLevel: notification.patient.currentLevel,
          preferredLanguage: notification.patient.preferredLanguage,
        },
        attemptId: notification.attempt?.id ?? null,
      })),
    };
  }

  async markAsRead(notificationId: string, professionalId: string) {
    const notification = await this.notificationRepository.findOne({
      where: { id: notificationId },
      relations: { recipient: true },
    });

    if (!notification) {
      throw new NotFoundException(`Notification ${notificationId} not found`);
    }

    if (notification.recipient.id !== professionalId) {
      throw new ForbiddenException('Notification access denied');
    }

    if (notification.status === NotificationStatus.READ) {
      return {
        id: notification.id,
        status: notification.status,
        readAt: notification.readAt,
      };
    }

    notification.status = NotificationStatus.READ;
    notification.readAt = new Date();
    const saved = await this.notificationRepository.save(notification);
    return {
      id: saved.id,
      status: saved.status,
      readAt: saved.readAt,
    };
  }
}
