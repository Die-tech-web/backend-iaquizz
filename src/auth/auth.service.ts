import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { PatientEntity } from '../patient/entities/patient.entity';
import { RegisterPatientDto } from './dto/register-patient.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterProfessionalDto } from './dto/register-professional.dto';
import { IcdService } from '../icd/icd.service';
import {
  DEFAULT_PATIENT_LANGUAGE,
  resolvePatientLanguage,
} from '../common/enums/language.enum';
import { ProfessionalService } from '../professional/professional.service';
import { AuthRole } from '../common/enums/auth-role.enum';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(PatientEntity)
    private readonly patientRepository: Repository<PatientEntity>,
    private readonly jwtService: JwtService,
    private readonly icdService: IcdService,
    private readonly professionalService: ProfessionalService,
  ) {}

  async registerPatient(dto: RegisterPatientDto) {
    const normalizedEmail = this.normalizeEmail(dto.email);
    await this.ensureEmailIsAvailable(normalizedEmail);

    const conditionKeys = dto.conditionKeys ?? [];
    const conditionMap = await this.icdService.getTopicMapByKeys(conditionKeys);
    const passwordHash = await bcrypt.hash(dto.password, 10);

    const patient = await this.patientRepository.save(
      this.patientRepository.create({
        email: normalizedEmail,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        birthDate: dto.birthDate,
        sex: dto.sex,
        profile: dto.profile,
        preferredLanguage: dto.preferredLanguage ?? DEFAULT_PATIENT_LANGUAGE,
        conditions: conditionKeys
          .map((key) => conditionMap.get(key))
          .filter((item): item is NonNullable<typeof item> => Boolean(item)),
      }),
    );

    return this.buildAuthResponse(patient);
  }

  async login(dto: LoginDto) {
    const normalizedEmail = this.normalizeEmail(dto.email);
    const patient = await this.patientRepository.findOne({
      where: { email: normalizedEmail },
    });

    if (!patient || !patient.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, patient.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.buildAuthResponse(patient);
  }

  async registerProfessional(dto: RegisterProfessionalDto) {
    const normalizedEmail = this.normalizeEmail(dto.email);
    await this.ensureEmailIsAvailable(normalizedEmail);

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const professional = await this.professionalService.create({
      email: normalizedEmail,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      specialty: dto.specialty,
      facilityName: dto.facilityName,
      licenseNumber: dto.licenseNumber,
    });

    return this.buildProfessionalAuthResponse(professional);
  }

  async loginProfessional(dto: LoginDto) {
    const normalizedEmail = this.normalizeEmail(dto.email);
    const professional = await this.professionalService.findByEmail(normalizedEmail);

    if (!professional || !professional.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, professional.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.buildProfessionalAuthResponse(professional);
  }

  private normalizeEmail(email: string) {
    return email.toLowerCase().trim();
  }

  private async ensureEmailIsAvailable(email: string) {
    const [existingPatient, existingProfessional] = await Promise.all([
      this.patientRepository.findOne({ where: { email } }),
      this.professionalService.findByEmail(email),
    ]);

    if (existingPatient || existingProfessional) {
      throw new ConflictException('Email already in use');
    }
  }

  private buildAuthResponse(patient: PatientEntity) {
    const payload = {
      sub: patient.id,
      email: patient.email,
      profile: patient.profile,
      role: AuthRole.PATIENT,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      tokenType: 'Bearer',
      expiresIn: '24h',
      role: AuthRole.PATIENT,
      patient: {
        id: patient.id,
        email: patient.email,
        firstName: patient.firstName,
        lastName: patient.lastName,
        profile: patient.profile,
        currentLevel: patient.currentLevel,
        preferredLanguage: resolvePatientLanguage(patient.preferredLanguage),
      },
    };
  }

  private buildProfessionalAuthResponse(professional: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    specialty: string | null;
    facilityName: string | null;
    licenseNumber: string | null;
  }) {
    const payload = {
      sub: professional.id,
      email: professional.email,
      role: AuthRole.HEALTH_PROFESSIONAL,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      tokenType: 'Bearer',
      expiresIn: '24h',
      role: AuthRole.HEALTH_PROFESSIONAL,
      professional: {
        id: professional.id,
        email: professional.email,
        firstName: professional.firstName,
        lastName: professional.lastName,
        specialty: professional.specialty,
        facilityName: professional.facilityName,
        licenseNumber: professional.licenseNumber,
      },
    };
  }
}
