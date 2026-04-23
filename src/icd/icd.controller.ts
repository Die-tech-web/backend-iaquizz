import {
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  Query,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { IcdService } from './icd.service';
import { MedicalTopicKey } from '../common/enums/medical-topic.enum';
import { Public } from '../common/decorators/public.decorator';
import { SearchIcdQueryDto } from './dto/search-icd-query.dto';

@ApiTags('ICD-11')
@Controller('icd')
export class IcdController {
  constructor(private readonly icdService: IcdService) {}

  @Get('topics')
  @Public()
  @ApiOperation({
    summary: 'Catalogue local ICD-11',
    description:
      'Retourne la liste locale des maladies/themes utilises par la plateforme pour les quiz et analyses.',
  })
  @ApiResponse({
    status: 200,
    description: 'Catalogue ICD-11 local',
  })
  findAllTopics() {
    return this.icdService.findAllTopics();
  }

  @Get('correlations/:mainTopic')
  @Public()
  @ApiOperation({
    summary: 'Correlations cliniques par maladie principale',
    description:
      'Retourne les maladies/themes correles pour une maladie dominante (ex: IRC -> diabete, HTA, dialyse).',
  })
  @ApiParam({
    name: 'mainTopic',
    enum: MedicalTopicKey,
    example: MedicalTopicKey.CHRONIC_KIDNEY_DISEASE,
    description:
      'Code interne de la maladie principale. Exemple recommande: CHRONIC_KIDNEY_DISEASE',
  })
  @ApiResponse({
    status: 200,
    description: 'Correlations triees par priorite',
  })
  findCorrelations(
    @Param('mainTopic', new ParseEnumPipe(MedicalTopicKey)) mainTopic: MedicalTopicKey,
  ) {
    return this.icdService.findCorrelations(mainTopic);
  }

  @Get('external/search')
  @Public()
  @ApiOperation({
    summary: 'Recherche live dans l API officielle WHO ICD-11',
    description:
      'Interroge en temps reel l API WHO ICD-11 (v2). Exemples de demo DG: q=chronic kidney disease&lang=en ou q=insuffisance renale chronique&lang=fr.',
  })
  @ApiQuery({
    name: 'q',
    required: true,
    example: 'chronic kidney disease',
    description:
      'Texte recherche. Exemples: "chronic kidney disease" (EN) ou "insuffisance renale chronique" (FR).',
  })
  @ApiQuery({
    name: 'lang',
    required: false,
    example: 'fr',
    description: 'Langue de retour demandee a WHO ICD API. Valeurs usuelles: fr, en.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    example: 5,
    description: 'Nombre maximal de resultats (1 a 50).',
  })
  @ApiResponse({
    status: 200,
    description: 'Resultats WHO ICD-11',
    schema: {
      example: {
        source: 'WHO ICD-11 API',
        releaseBaseUrl: 'https://id.who.int/icd/release/11/2026-01/mms',
        language: 'fr',
        query: 'insuffisance renale chronique',
        count: 2,
        items: [
          {
            id: 'http://id.who.int/icd/release/11/2026-01/mms/123456789/unspecified',
            title: 'Insuffisance renale chronique, stade non precise',
            code: 'GB61.Z',
            uri: null,
          },
        ],
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Parametres invalides ou credentials WHO manquants',
  })
  @ApiResponse({
    status: 502,
    description: 'Erreur amont WHO ICD API',
  })
  searchExternal(@Query() query: SearchIcdQueryDto) {
    return this.icdService.searchExternal(query);
  }
}
