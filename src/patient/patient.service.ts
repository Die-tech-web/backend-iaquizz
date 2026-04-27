import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PatientEntity } from './entities/patient.entity';
import { CreatePatientDto } from './dto/create-patient.dto';
import { IcdService } from '../icd/icd.service';
import { PatientLanguage, resolvePatientLanguage } from '../common/enums/language.enum';

@Injectable()
export class PatientService {
  constructor(
    @InjectRepository(PatientEntity)
    private readonly patientRepository: Repository<PatientEntity>,
    private readonly icdService: IcdService,
  ) {}

  async create(dto: CreatePatientDto): Promise<PatientEntity> {
    const conditionKeys = dto.conditionKeys ?? [];
    const conditionMap = await this.icdService.getTopicMapByKeys(conditionKeys);

    const patient = this.patientRepository.create({
      ...dto,
      conditions: conditionKeys
        .map((key) => conditionMap.get(key))
        .filter((item): item is NonNullable<typeof item> => Boolean(item)),
    });

    return this.patientRepository.save(patient);
  }

  async findAll(): Promise<PatientEntity[]> {
    return this.patientRepository.find({ order: { lastName: 'ASC', firstName: 'ASC' } });
  }

  async findById(id: string): Promise<PatientEntity> {
    const patient = await this.patientRepository.findOne({ where: { id } });
    if (!patient) {
      throw new NotFoundException(`Patient ${id} not found`);
    }

    return patient;
  }

  async updatePreferredLanguage(id: string, preferredLanguage: PatientLanguage) {
    const patient = await this.findById(id);
    patient.preferredLanguage = resolvePatientLanguage(preferredLanguage);
    const saved = await this.patientRepository.save(patient);
    return {
      id: saved.id,
      preferredLanguage: saved.preferredLanguage,
    };
  }
}
