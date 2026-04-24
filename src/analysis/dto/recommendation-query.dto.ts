import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { MedicalTopicKey } from '../../common/enums/medical-topic.enum';

export class RecommendationQueryDto {
  @ApiPropertyOptional({ enum: MedicalTopicKey, example: MedicalTopicKey.CHRONIC_KIDNEY_DISEASE })
  @IsOptional()
  @IsEnum(MedicalTopicKey)
  dominantDisease?: MedicalTopicKey;

  @ApiPropertyOptional({
    example: 5,
    minimum: 1,
    maximum: 20,
    description: 'Nombre maximum de recommandations a retourner (utilise par la V2).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}
