import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PatientEntity } from '../patient/entities/patient.entity';
import { CareTeamAssignmentEntity } from './entities/care-team-assignment.entity';
import { HealthProfessionalEntity } from './entities/health-professional.entity';

export interface CreateHealthProfessionalInput {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  specialty?: string | null;
  facilityName?: string | null;
  licenseNumber?: string | null;
}

@Injectable()
export class ProfessionalService {
  constructor(
    @InjectRepository(HealthProfessionalEntity)
    private readonly professionalRepository: Repository<HealthProfessionalEntity>,
    @InjectRepository(CareTeamAssignmentEntity)
    private readonly assignmentRepository: Repository<CareTeamAssignmentEntity>,
  ) {}

  findByEmail(email: string) {
    return this.professionalRepository.findOne({ where: { email } });
  }

  create(input: CreateHealthProfessionalInput) {
    const professional = this.professionalRepository.create({
      ...input,
      specialty: input.specialty ?? null,
      facilityName: input.facilityName ?? null,
      licenseNumber: input.licenseNumber ?? null,
    });
    return this.professionalRepository.save(professional);
  }

  findAllActive() {
    return this.professionalRepository.find({
      where: { isActive: true },
      order: { lastName: 'ASC', firstName: 'ASC' },
    });
  }

  async findRecipientsForPatient(patientId: string) {
    const assignments = await this.assignmentRepository.find({
      where: {
        patient: { id: patientId },
        isActive: true,
        professional: { isActive: true },
      },
      relations: { professional: true },
    });

    if (assignments.length > 0) {
      return assignments.map((assignment) => assignment.professional);
    }

    return this.findAllActive();
  }

  async getPatientIdsForProfessional(professionalId: string) {
    const assignments = await this.assignmentRepository.find({
      where: {
        professional: { id: professionalId },
        isActive: true,
      },
      relations: { patient: true },
    });

    return assignments.map((assignment) => assignment.patient.id);
  }

  async bootstrapAssignmentsForProfessional(professionalId: string, patientIds: string[]) {
    const existingPatientIds = new Set(await this.getPatientIdsForProfessional(professionalId));
    const missingPatientIds = patientIds.filter((patientId) => !existingPatientIds.has(patientId));

    if (!missingPatientIds.length) {
      return;
    }

    const rows = missingPatientIds.map((patientId) =>
      this.assignmentRepository.create({
        professional: { id: professionalId } as HealthProfessionalEntity,
        patient: { id: patientId } as PatientEntity,
        isActive: true,
        lastAssignedAt: new Date(),
      }),
    );
    await this.assignmentRepository.save(rows);
  }
}
