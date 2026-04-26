import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { MedicalTopicKey } from '../../common/enums/medical-topic.enum';
import { PatientProfile } from '../../common/enums/patient.enum';
import { QuizLevel, QuizTheme } from '../../common/enums/quiz.enum';

const toArray = ({ value }: { value: unknown }): string[] | undefined => {
  if (!value) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }

  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const toBoolean = ({ value }: { value: unknown }): boolean | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value).toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
};

export class FilterQuizDto {
  @ApiPropertyOptional({ enum: MedicalTopicKey, example: MedicalTopicKey.CHRONIC_KIDNEY_DISEASE })
  @IsOptional()
  @IsEnum(MedicalTopicKey)
  mainDisease?: MedicalTopicKey;

  @ApiPropertyOptional({
    enum: MedicalTopicKey,
    isArray: true,
    example: [MedicalTopicKey.DIABETES, MedicalTopicKey.HYPERTENSION],
    description: 'Accepte un CSV: DIABETES,HYPERTENSION',
  })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsEnum(MedicalTopicKey, { each: true })
  correlatedDiseases?: MedicalTopicKey[];

  @ApiPropertyOptional({
    enum: QuizTheme,
    isArray: true,
    example: [QuizTheme.FOLLOW_UP, QuizTheme.NUTRITION],
    description: 'Accepte un CSV: FOLLOW_UP,NUTRITION',
  })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsEnum(QuizTheme, { each: true })
  themes?: QuizTheme[];

  @ApiPropertyOptional({ enum: QuizLevel, example: QuizLevel.BEGINNER })
  @IsOptional()
  @IsEnum(QuizLevel)
  level?: QuizLevel;

  @ApiPropertyOptional({ enum: PatientProfile, example: PatientProfile.DIALYSIS })
  @IsOptional()
  @IsEnum(PatientProfile)
  patientProfile?: PatientProfile;

  @ApiPropertyOptional({
    example: '6f7f0eb2-8778-48e4-b7ba-84b61be7f819',
    description: 'UUID patient pour personnalisation contextualisee',
  })
  @IsOptional()
  @IsUUID()
  patientId?: string;

  @ApiPropertyOptional({
    example: true,
    default: true,
    description:
      'Si true (par defaut), le backend calcule automatiquement le niveau recommande selon les quiz completes et les scores du patient.',
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  autoLevel?: boolean;
}
