import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PatientService } from './patient.service';
import { CreatePatientDto } from './dto/create-patient.dto';

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
}
