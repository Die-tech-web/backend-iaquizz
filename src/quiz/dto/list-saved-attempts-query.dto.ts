import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class ListSavedAttemptsQueryDto {
  @ApiPropertyOptional({
    example: 50,
    description: 'Nombre maximum de quiz termines a retourner (1 a 200).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
