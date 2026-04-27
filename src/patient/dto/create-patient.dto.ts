import { IsArray, IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MedicalTopicKey } from '../../common/enums/medical-topic.enum';
import { BiologicalSex, PatientProfile } from '../../common/enums/patient.enum';
import { PatientLanguage } from '../../common/enums/language.enum';

export class CreatePatientDto {
  @ApiPropertyOptional({ example: 'AKA-001' })
  @IsOptional()
  @IsString()
  externalRef?: string;

  @ApiProperty({ example: 'Awa' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Diallo' })
  @IsString()
  lastName: string;

  @ApiPropertyOptional({ example: '1992-07-16' })
  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @ApiPropertyOptional({ enum: BiologicalSex, example: BiologicalSex.FEMALE })
  @IsOptional()
  @IsEnum(BiologicalSex)
  sex?: BiologicalSex;

  @ApiPropertyOptional({ enum: PatientProfile, example: PatientProfile.CHRONIC })
  @IsOptional()
  @IsEnum(PatientProfile)
  profile?: PatientProfile;

  @ApiPropertyOptional({ enum: PatientLanguage, example: PatientLanguage.FR })
  @IsOptional()
  @IsEnum(PatientLanguage)
  preferredLanguage?: PatientLanguage;

  @ApiPropertyOptional({
    enum: MedicalTopicKey,
    isArray: true,
    example: [MedicalTopicKey.CHRONIC_KIDNEY_DISEASE, MedicalTopicKey.DIABETES],
  })
  @IsOptional()
  @IsArray()
  @IsEnum(MedicalTopicKey, { each: true })
  conditionKeys?: MedicalTopicKey[];
}
