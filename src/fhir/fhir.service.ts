import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { QuizEntity } from '../quiz/entities/quiz.entity';
import { QuizAttemptEntity } from '../quiz/entities/quiz-attempt.entity';
import {
  QuizAttemptStatus,
  QuizQuestionType,
  QuizStatus,
} from '../common/enums/quiz.enum';
import { FhirQuestionnaire } from './interfaces/questionnaire.interface';
import { FhirQuestionnaireResponse } from './interfaces/questionnaire-response.interface';

@Injectable()
export class FhirService {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  toQuestionnaire(quiz: QuizEntity): FhirQuestionnaire {
    return {
      resourceType: 'Questionnaire',
      id: quiz.id,
      title: quiz.title,
      status: quiz.status === QuizStatus.PUBLISHED ? 'active' : 'draft',
      subjectType: ['Patient'],
      code: [
        {
          coding: [
            {
              system: 'http://id.who.int/icd/release/11/mms',
              code: quiz.mainTopic.icd11Code ?? quiz.mainTopic.key,
              display: quiz.mainTopic.label,
            },
          ],
        },
      ],
      item: quiz.questions.map((question) => ({
        linkId: question.linkId,
        text: question.promptText ?? question.text,
        type:
          question.type === QuizQuestionType.BOOLEAN ? 'boolean' : 'choice',
        answerOption: question.options.map((option) => ({
          valueCoding: {
            code: option.code,
            display: option.label,
          },
        })),
      })),
    };
  }

  toQuestionnaireResponse(attempt: QuizAttemptEntity): FhirQuestionnaireResponse {
    return {
      resourceType: 'QuestionnaireResponse',
      id: attempt.id,
      status:
        attempt.status === QuizAttemptStatus.COMPLETED
          ? 'completed'
          : 'in-progress',
      authored: (attempt.completedAt ?? attempt.startedAt).toISOString(),
      questionnaire: `Questionnaire/${attempt.quiz.id}`,
      subject: {
        reference: `Patient/${attempt.patient.id}`,
      },
      item: attempt.answers.map((answer) => ({
        linkId: answer.question.linkId,
        answer: answer.value.map((code) => ({
          valueCoding: {
            code,
          },
        })),
      })),
    };
  }

  async publishQuestionnaire(quiz: QuizEntity) {
    const resource = this.toQuestionnaire(quiz);
    return this.publishResource('Questionnaire', resource);
  }

  async publishQuestionnaireResponse(attempt: QuizAttemptEntity) {
    const resource = this.toQuestionnaireResponse(attempt);
    return this.publishResource('QuestionnaireResponse', resource);
  }

  private async publishResource(
    resourceType: 'Questionnaire' | 'QuestionnaireResponse',
    resource: FhirQuestionnaire | FhirQuestionnaireResponse,
  ) {
    const baseUrl = this.configService
      .get<string>('FHIR_SERVER_BASE_URL')
      ?.replace(/\/$/, '');

    if (!baseUrl) {
      throw new BadRequestException(
        'FHIR_SERVER_BASE_URL missing in .env (example: http://hapi.fhir.org/baseR4)',
      );
    }

    const authToken = this.configService.get<string>('FHIR_SERVER_AUTH_TOKEN');
    const headers: Record<string, string> = {
      'Content-Type': 'application/fhir+json',
      Accept: 'application/fhir+json, application/json',
    };

    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post(`${baseUrl}/${resourceType}`, resource, { headers }),
      );

      return {
        message: `${resourceType} published to FHIR server`,
        fhirServer: baseUrl,
        location: response.headers.location ?? null,
        data: response.data,
      };
    } catch (error: unknown) {
      throw new BadGatewayException(
        `FHIR server publish failed: ${this.toErrorMessage(error)}`,
      );
    }
  }

  private toErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return 'Unknown error';
  }
}
