import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { PatientLanguage } from '../../common/enums/language.enum';

export class SubmittedAnswerDto {
  @ApiProperty({ example: 'b31da2f2-649e-4ca1-ac75-d0f275c9ff5f' })
  @IsUUID()
  questionId: string;

  @ApiProperty({ type: [String], example: ['A'] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  value: string[];
}

export class SubmitQuizDto {
  @ApiProperty({ example: '6f7f0eb2-8778-48e4-b7ba-84b61be7f819' })
  @IsUUID()
  patientId: string;

  @ApiProperty({ example: '73f34f27-e58f-4a98-9b4c-a80d6990edfd' })
  @IsUUID()
  quizId: string;

  @ApiProperty({
    type: [SubmittedAnswerDto],
    example: [
      { questionId: 'b31da2f2-649e-4ca1-ac75-d0f275c9ff5f', value: ['A'] },
      { questionId: '7e9c3ff4-6964-4fb1-95e0-b0e067f10bd4', value: ['A', 'B'] },
    ],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SubmittedAnswerDto)
  answers: SubmittedAnswerDto[];

  @ApiProperty({ example: 'mobile-app-akacare' })
  @IsString()
  @IsNotEmpty()
  submittedBy: string;

  @ApiProperty({ enum: PatientLanguage, required: false, example: PatientLanguage.FR })
  @IsEnum(PatientLanguage)
  @IsOptional()
  language?: PatientLanguage;
}
