import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class SaveQuizAttemptDto {
  @ApiProperty({ example: '6f7f0eb2-8778-48e4-b7ba-84b61be7f819' })
  @IsUUID()
  patientId: string;
}
