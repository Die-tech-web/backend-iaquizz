import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FhirService } from './fhir.service';
import { QuizService } from '../quiz/quiz.service';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('FHIR')
@Controller('fhir')
export class FhirController {
  constructor(
    private readonly fhirService: FhirService,
    private readonly quizService: QuizService,
  ) {}

  @Get('questionnaire/:quizId')
  @Public()
  @ApiOperation({
    summary: 'Exporter un quiz en FHIR Questionnaire',
    description:
      'Transforme un quiz interne en ressource FHIR Questionnaire (standard interoperable pour partage SIH, dossier patient, partenaires).',
  })
  @ApiParam({
    name: 'quizId',
    example: '73f34f27-e58f-4a98-9b4c-a80d6990edfd',
    description: 'Identifiant UUID du quiz a exporter.',
  })
  @ApiResponse({
    status: 200,
    description: 'FHIR Questionnaire genere avec succes',
    schema: {
      example: {
        resourceType: 'Questionnaire',
        id: '73f34f27-e58f-4a98-9b4c-a80d6990edfd',
        title: 'IRC et Dialyse - Bases patient',
        status: 'active',
        subjectType: ['Patient'],
        item: [
          {
            linkId: 'q1',
            text: 'Quelle maladie est frequemment associee a l insuffisance renale chronique ?',
            type: 'choice',
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Quiz introuvable' })
  async getQuestionnaire(@Param('quizId', ParseUUIDPipe) quizId: string) {
    const quiz = await this.quizService.findOne(quizId);
    return this.fhirService.toQuestionnaire(quiz);
  }

  @Get('questionnaire-response/:attemptId')
  @Public()
  @ApiOperation({
    summary: 'Exporter une soumission en FHIR QuestionnaireResponse',
    description:
      'Transforme une tentative quiz patient en ressource FHIR QuestionnaireResponse pour interoperation clinique.',
  })
  @ApiParam({
    name: 'attemptId',
    example: '91af2c34-fbe7-4b9d-a67d-ff6bc89f9f13',
    description: 'Identifiant UUID de la tentative/soumission.',
  })
  @ApiResponse({
    status: 200,
    description: 'FHIR QuestionnaireResponse genere avec succes',
    schema: {
      example: {
        resourceType: 'QuestionnaireResponse',
        id: '91af2c34-fbe7-4b9d-a67d-ff6bc89f9f13',
        status: 'completed',
        questionnaire: 'Questionnaire/73f34f27-e58f-4a98-9b4c-a80d6990edfd',
        subject: {
          reference: 'Patient/21985d5d-8063-46d5-a84f-6ecf09f1c2af',
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Tentative introuvable' })
  async getQuestionnaireResponse(
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
  ) {
    const attempt = await this.quizService.findAttemptById(attemptId);
    return this.fhirService.toQuestionnaireResponse(attempt);
  }

  @Post('publish/questionnaire/:quizId')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Publier un Questionnaire sur serveur FHIR externe',
    description:
      'Publie le Questionnaire converti vers le serveur FHIR configure dans FHIR_SERVER_BASE_URL. Endpoint protege (JWT requis).',
  })
  @ApiParam({
    name: 'quizId',
    example: '73f34f27-e58f-4a98-9b4c-a80d6990edfd',
    description: 'Identifiant UUID du quiz a publier.',
  })
  @ApiResponse({
    status: 201,
    description: 'Questionnaire publie',
    schema: {
      example: {
        message: 'Questionnaire published to FHIR server',
        fhirServer: 'http://hapi.fhir.org/baseR4',
        location: 'Questionnaire/123/_history/1',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'JWT manquant ou invalide' })
  @ApiResponse({ status: 404, description: 'Quiz introuvable' })
  @ApiResponse({ status: 502, description: 'Erreur du serveur FHIR externe' })
  async publishQuestionnaire(@Param('quizId', ParseUUIDPipe) quizId: string) {
    const quiz = await this.quizService.findOne(quizId);
    return this.fhirService.publishQuestionnaire(quiz);
  }

  @Post('publish/questionnaire-response/:attemptId')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Publier un QuestionnaireResponse sur serveur FHIR externe',
    description:
      'Publie la reponse patient (QuestionnaireResponse) vers le serveur FHIR configure. Endpoint protege (JWT requis).',
  })
  @ApiParam({
    name: 'attemptId',
    example: '91af2c34-fbe7-4b9d-a67d-ff6bc89f9f13',
    description: 'Identifiant UUID de la tentative a publier.',
  })
  @ApiResponse({
    status: 201,
    description: 'QuestionnaireResponse publie',
    schema: {
      example: {
        message: 'QuestionnaireResponse published to FHIR server',
        fhirServer: 'http://hapi.fhir.org/baseR4',
        location: 'QuestionnaireResponse/456/_history/1',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'JWT manquant ou invalide' })
  @ApiResponse({ status: 404, description: 'Tentative introuvable' })
  @ApiResponse({ status: 502, description: 'Erreur du serveur FHIR externe' })
  async publishQuestionnaireResponse(
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
  ) {
    const attempt = await this.quizService.findAttemptById(attemptId);
    return this.fhirService.publishQuestionnaireResponse(attempt);
  }
}
