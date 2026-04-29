import {
  Body,
  Controller,
  DefaultValuePipe,
  ForbiddenException,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { QuizService } from './quiz.service';
import { FilterQuizDto } from './dto/filter-quiz.dto';
import { SubmitQuizDto } from './dto/submit-quiz.dto';
import { SaveQuizAttemptDto } from './dto/save-quiz-attempt.dto';
import { ListSavedAttemptsQueryDto } from './dto/list-saved-attempts-query.dto';
import { MedicalTopicKey } from '../common/enums/medical-topic.enum';
import { PatientProfile } from '../common/enums/patient.enum';
import { QuizLevel } from '../common/enums/quiz.enum';
import { Public } from '../common/decorators/public.decorator';
import { PatientLanguage } from '../common/enums/language.enum';
import { Request } from 'express';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { AuthRole } from '../common/enums/auth-role.enum';

@ApiTags('Quizzes')
@Controller('quizzes')
export class QuizController {
  constructor(private readonly quizService: QuizService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Filtrer les quiz par maladie, correlations, profil et niveau' })
  @ApiQuery({ name: 'mainDisease', required: false, enum: MedicalTopicKey })
  @ApiQuery({
    name: 'correlatedDiseases',
    required: false,
    example: 'DIABETES,HYPERTENSION',
  })
  @ApiQuery({ name: 'themes', required: false, example: 'FOLLOW_UP,NUTRITION' })
  @ApiQuery({ name: 'level', required: false, enum: QuizLevel })
  @ApiQuery({ name: 'patientProfile', required: false, enum: PatientProfile })
  @ApiQuery({
    name: 'autoLevel',
    required: false,
    example: true,
    description:
      'Active la selection automatique du niveau selon l historique patient (active par defaut si patientId est fourni).',
  })
  @ApiQuery({
    name: 'patientId',
    required: false,
    example: '6f7f0eb2-8778-48e4-b7ba-84b61be7f819',
  })
  @ApiQuery({
    name: 'lang',
    required: false,
    enum: PatientLanguage,
    description: 'Langue de restitution des contenus quiz (fallback FR si indisponible).',
  })
  @ApiResponse({ status: 200, description: 'Liste des quiz filtres' })
  filter(@Query() dto: FilterQuizDto) {
    return this.quizService.filter(dto);
  }

  @Get('backoffice/patient/:patientId/adaptive-level')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Back-office: recuperer le niveau recommande automatiquement selon progression et historiques quiz',
  })
  @ApiParam({ name: 'patientId', example: '6f7f0eb2-8778-48e4-b7ba-84b61be7f819' })
  @ApiResponse({
    status: 200,
    description:
      'Decision d adaptation de niveau (niveau courant, niveau recommande, taux de progression et statistiques).',
  })
  getAdaptiveLevel(@Param('patientId', ParseUUIDPipe) patientId: string) {
    return this.quizService.getAdaptiveLevelDecision(patientId);
  }

  @Get('recommended/patient/:patientId')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Recuperer les quiz recommandes selon le niveau courant du patient (debutant -> intermediaire -> avance)',
  })
  @ApiParam({ name: 'patientId', example: '6f7f0eb2-8778-48e4-b7ba-84b61be7f819' })
  @ApiQuery({ name: 'mainDisease', required: false, enum: MedicalTopicKey })
  @ApiQuery({ name: 'themes', required: false, example: 'FOLLOW_UP,NUTRITION' })
  @ApiQuery({
    name: 'lang',
    required: false,
    enum: PatientLanguage,
    description: 'Langue de restitution des contenus quiz recommandes.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Liste des quiz recommandes autorises pour le niveau debloque du patient + progression.',
  })
  getRecommendedForPatient(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Query() dto: FilterQuizDto,
  ) {
    return this.quizService.getRecommendedQuizzesForPatient(patientId, dto);
  }

  @Get('catalog/coverage')
  @Public()
  @ApiOperation({
    summary: 'Verifier la couverture catalogue par theme',
    description:
      'Retourne le nombre de quiz publies par theme et indique si le minimum attendu est atteint.',
  })
  @ApiResponse({ status: 200, description: 'Etat de couverture du catalogue quiz' })
  getCatalogCoverage() {
    return this.quizService.getThemeCoverage();
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Recuperer un quiz par UUID' })
  @ApiParam({ name: 'id', example: '73f34f27-e58f-4a98-9b4c-a80d6990edfd' })
  @ApiQuery({
    name: 'lang',
    required: false,
    enum: PatientLanguage,
    description: 'Langue de restitution du quiz (fallback FR).',
  })
  @ApiResponse({ status: 200, description: 'Quiz trouve' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(
      'lang',
      new DefaultValuePipe(PatientLanguage.FR),
      new ParseEnumPipe(PatientLanguage),
    )
    lang: PatientLanguage,
  ) {
    return this.quizService.findOne(id, lang);
  }

  @Post('submit')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Soumettre les reponses quiz, calculer le score et mettre a jour la progression patient',
  })
  @ApiBody({ type: SubmitQuizDto })
  @ApiResponse({
    status: 201,
    description:
      'Soumission enregistree avec score /10, niveau courant, prochain niveau, progression et message de felicitations si changement de niveau.',
  })
  submit(@Body() dto: SubmitQuizDto) {
    return this.quizService.submit(dto);
  }

  @Post('attempts/:attemptId/save')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Marquer une tentative terminee comme sauvegardee par le patient pour consultation ulterieure',
  })
  @ApiParam({ name: 'attemptId', example: '91af2c34-fbe7-4b9d-a67d-ff6bc89f9f13' })
  @ApiBody({ type: SaveQuizAttemptDto })
  @ApiResponse({
    status: 201,
    description:
      'Tentative marquee comme sauvegardee avec le detail des questions/reponses (historique patient).',
  })
  saveAttempt(
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Body() dto: SaveQuizAttemptDto,
  ) {
    return this.quizService.saveAttemptForPatient(attemptId, dto.patientId);
  }

  @Get('patient/:patientId/saved-attempts')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Recuperer les derniers quiz termines d un patient avec questions/reponses',
  })
  @ApiParam({ name: 'patientId', example: '6f7f0eb2-8778-48e4-b7ba-84b61be7f819' })
  @ApiQuery({
    name: 'limit',
    required: false,
    example: 50,
    description: 'Nombre maximum de quiz termines a retourner (1 a 200).',
  })
  @ApiResponse({
    status: 200,
    description:
      'Liste des quiz termines (score + questions/reponses + bonnes reponses).',
  })
  listSavedAttempts(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Query(new DefaultValuePipe({ limit: 50 })) query: ListSavedAttemptsQueryDto,
  ) {
    return this.quizService.listSavedAttemptsForPatient(patientId, query.limit ?? 50);
  }

  @Get('professional/patient/:patientId/saved-attempts')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Dashboard professionnel: recuperer les quiz enregistres d un patient assigne',
  })
  @ApiParam({ name: 'patientId', example: '6f7f0eb2-8778-48e4-b7ba-84b61be7f819' })
  @ApiQuery({
    name: 'limit',
    required: false,
    example: 2,
    description: 'Nombre maximum de quiz enregistres a retourner (limite a 2 pour le dashboard professionnel).',
  })
  @ApiResponse({
    status: 200,
    description:
      'Liste des quiz enregistres du patient pour aide a la decision clinique du professionnel.',
  })
  listSavedAttemptsForProfessional(
    @Req() request: Request & { user: JwtPayload },
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Query(new DefaultValuePipe({ limit: 2 })) query: ListSavedAttemptsQueryDto,
  ) {
    if (request.user.role !== AuthRole.HEALTH_PROFESSIONAL) {
      throw new ForbiddenException('Endpoint reserve aux professionnels de sante');
    }

    return this.quizService.listSavedAttemptsForProfessional({
      professionalId: request.user.sub,
      patientId,
      limit: query.limit ?? 2,
    });
  }
}
