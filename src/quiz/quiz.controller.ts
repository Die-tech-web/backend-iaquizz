import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
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
import { MedicalTopicKey } from '../common/enums/medical-topic.enum';
import { PatientProfile } from '../common/enums/patient.enum';
import { QuizLevel } from '../common/enums/quiz.enum';
import { Public } from '../common/decorators/public.decorator';

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
  @ApiResponse({ status: 200, description: 'Quiz trouve' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.quizService.findOne(id);
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
}
