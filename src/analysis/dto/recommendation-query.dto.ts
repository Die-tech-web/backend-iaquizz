import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { MedicalTopicKey } from '../../common/enums/medical-topic.enum';

export class RecommendationQueryDto {
  @ApiPropertyOptional({ enum: MedicalTopicKey, example: MedicalTopicKey.CHRONIC_KIDNEY_DISEASE })
  @IsOptional()
  @IsEnum(MedicalTopicKey)
  dominantDisease?: MedicalTopicKey;
}
