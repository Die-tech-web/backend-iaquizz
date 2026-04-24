import { Controller, Get, Param, ParseEnumPipe, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AnalysisService } from './analysis.service';
import { MedicalTopicKey } from '../common/enums/medical-topic.enum';
import { RecommendationQueryDto } from './dto/recommendation-query.dto';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Analysis')
@Controller('analysis')
export class AnalysisController {
  constructor(private readonly analysisService: AnalysisService) {}

  @Get('correlations/:mainTopic')
  @Public()
  @ApiOperation({ summary: 'Obtenir le graphe de correlations pour une maladie dominante' })
  @ApiParam({ name: 'mainTopic', enum: MedicalTopicKey, example: MedicalTopicKey.CHRONIC_KIDNEY_DISEASE })
  @ApiResponse({ status: 200, description: 'Graphe de correlations' })
  getCorrelationGraph(
    @Param('mainTopic', new ParseEnumPipe(MedicalTopicKey)) mainTopic: MedicalTopicKey,
  ) {
    return this.analysisService.getCorrelationGraph(mainTopic);
  }

  @Get('recommendations/patient/:patientId')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Recommander des quiz personnalises pour un patient' })
  @ApiParam({
    name: 'patientId',
    example: '6f7f0eb2-8778-48e4-b7ba-84b61be7f819',
  })
  @ApiQuery({
    name: 'dominantDisease',
    required: false,
    enum: MedicalTopicKey,
    example: MedicalTopicKey.CHRONIC_KIDNEY_DISEASE,
  })
  @ApiResponse({ status: 200, description: 'Liste des recommandations' })
  recommendForPatient(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Query() query: RecommendationQueryDto,
  ) {
    return this.analysisService.recommendForPatient(patientId, query);
  }

  @Get('recommendations-v2/patient/:patientId')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Recommandations quiz personnalisees avec score de pertinence et raisons',
  })
  @ApiParam({
    name: 'patientId',
    example: '6f7f0eb2-8778-48e4-b7ba-84b61be7f819',
  })
  @ApiQuery({
    name: 'dominantDisease',
    required: false,
    enum: MedicalTopicKey,
    example: MedicalTopicKey.CHRONIC_KIDNEY_DISEASE,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    example: 5,
    description: 'Nombre maximum de recommandations (1 a 20)',
  })
  @ApiResponse({ status: 200, description: 'Recommandations classees par pertinence' })
  recommendForPatientV2(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Query() query: RecommendationQueryDto,
  ) {
    return this.analysisService.recommendForPatientV2(patientId, query);
  }
}
