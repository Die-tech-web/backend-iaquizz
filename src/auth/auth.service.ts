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
import { IcdService } from '../icd/icd.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(PatientEntity)
    private readonly patientRepository: Repository<PatientEntity>,
    private readonly jwtService: JwtService,
    private readonly icdService: IcdService,
  ) {}

  async registerPatient(dto: RegisterPatientDto) {
    const existing = await this.patientRepository.findOne({
      where: { email: dto.email.toLowerCase() },
    });

    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const conditionKeys = dto.conditionKeys ?? [];
    const conditionMap = await this.icdService.getTopicMapByKeys(conditionKeys);
    const passwordHash = await bcrypt.hash(dto.password, 10);

    const patient = await this.patientRepository.save(
      this.patientRepository.create({
        email: dto.email.toLowerCase(),
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        birthDate: dto.birthDate,
        sex: dto.sex,
        profile: dto.profile,
        conditions: conditionKeys
          .map((key) => conditionMap.get(key))
          .filter((item): item is NonNullable<typeof item> => Boolean(item)),
      }),
    );

    return this.buildAuthResponse(patient);
  }

  async login(dto: LoginDto) {
    const patient = await this.patientRepository.findOne({
      where: { email: dto.email.toLowerCase() },
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

  private buildAuthResponse(patient: PatientEntity) {
    const payload = {
      sub: patient.id,
      email: patient.email,
      profile: patient.profile,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      tokenType: 'Bearer',
      expiresIn: '24h',
      patient: {
        id: patient.id,
        email: patient.email,
        firstName: patient.firstName,
        lastName: patient.lastName,
        profile: patient.profile,
      },
    };
  }
}
