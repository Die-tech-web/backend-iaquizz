import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { AuthRole } from '../common/enums/auth-role.enum';
import { PatientService } from './patient.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePreferredLanguageDto } from './dto/update-preferred-language.dto';

@ApiTags('Patients')
@ApiBearerAuth('JWT-auth')
@Controller('patients')
export class PatientController {
  constructor(private readonly patientService: PatientService) {}

  @Post()
  @ApiOperation({ summary: 'Creer un patient (UUID genere automatiquement)' })
  @ApiBody({ type: CreatePatientDto })
  @ApiResponse({ status: 201, description: 'Patient cree avec succes' })
  create(@Body() dto: CreatePatientDto) {
    return this.patientService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lister les patients' })
  @ApiResponse({ status: 200, description: 'Liste des patients' })
  findAll() {
    return this.patientService.findAll();
  }

  @Get('professional-dashboard')
  @ApiOperation({
    summary:
      'Lister les patients exploitables dans le dashboard professionnel (comptes patients actifs)',
  })
  @ApiResponse({
    status: 200,
    description: 'Liste des patients avec compte patient (email + mot de passe)',
  })
  findAllForProfessionalDashboard(@Req() request: Request & { user: JwtPayload }) {
    if (request.user.role !== AuthRole.HEALTH_PROFESSIONAL) {
      throw new ForbiddenException('Professional dashboard is reserved to healthcare professionals');
    }

    return this.patientService.findAllForProfessionalDashboard(request.user.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Recuperer un patient par UUID' })
  @ApiParam({
    name: 'id',
    example: '6f7f0eb2-8778-48e4-b7ba-84b61be7f819',
  })
  @ApiResponse({ status: 200, description: 'Patient trouve' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.patientService.findById(id);
  }

  @Patch(':id/preferred-language')
  @ApiOperation({ summary: 'Mettre a jour la langue preferee du patient' })
  @ApiParam({
    name: 'id',
    example: '6f7f0eb2-8778-48e4-b7ba-84b61be7f819',
  })
  @ApiBody({ type: UpdatePreferredLanguageDto })
  @ApiResponse({ status: 200, description: 'Langue preferee mise a jour' })
  updatePreferredLanguage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePreferredLanguageDto,
  ) {
    return this.patientService.updatePreferredLanguage(id, dto.preferredLanguage);
  }
}
