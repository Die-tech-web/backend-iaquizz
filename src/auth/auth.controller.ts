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
import { RegisterPatientDto } from './dto/register-patient.dto';

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
}
