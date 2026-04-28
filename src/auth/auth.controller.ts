import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LoginProfessionalDto } from './dto/login-professional.dto';
import { RegisterPatientDto } from './dto/register-patient.dto';
import { RegisterProfessionalDto } from './dto/register-professional.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register-patient')
  @ApiOperation({ summary: 'Creer un compte patient et retourner un JWT' })
  @ApiBody({ type: RegisterPatientDto })
  @ApiResponse({ status: 201, description: 'Compte cree et token genere' })
  registerPatient(@Body() dto: RegisterPatientDto) {
    return this.authService.registerPatient(dto);
  }

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Connexion patient (email + password)' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 201, description: 'Connexion reussie avec JWT' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Post('register-professional')
  @ApiOperation({
    summary: 'Creer un compte professionnel de sante et retourner un JWT',
  })
  @ApiBody({ type: RegisterProfessionalDto })
  @ApiResponse({ status: 201, description: 'Compte professionnel cree et token genere' })
  registerProfessional(@Body() dto: RegisterProfessionalDto) {
    return this.authService.registerProfessional(dto);
  }

  @Public()
  @Post('login-professional')
  @ApiOperation({ summary: 'Connexion professionnel de sante (email + password)' })
  @ApiBody({ type: LoginProfessionalDto })
  @ApiResponse({ status: 201, description: 'Connexion professionnelle reussie avec JWT' })
  loginProfessional(@Body() dto: LoginProfessionalDto) {
    return this.authService.loginProfessional(dto);
  }
}
