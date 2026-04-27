import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { PatientLanguage } from '../../common/enums/language.enum';

export class UpdatePreferredLanguageDto {
  @ApiProperty({ enum: PatientLanguage, example: PatientLanguage.FR })
  @IsEnum(PatientLanguage)
  preferredLanguage: PatientLanguage;
}
