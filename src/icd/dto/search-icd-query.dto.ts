import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class SearchIcdQueryDto {
  @ApiProperty({
    example: 'chronic kidney disease',
    description:
      'Texte de recherche ICD-11. Exemple EN: chronic kidney disease. Exemple FR: insuffisance renale chronique.',
  })
  @IsString()
  q: string;

  @ApiProperty({
    required: false,
    example: 'fr',
    description: 'Langue de retour demandee a WHO ICD API (fr ou en).',
  })
  @IsOptional()
  @IsString()
  lang?: string;

  @ApiProperty({
    required: false,
    example: 10,
    minimum: 1,
    maximum: 50,
    description: 'Nombre maximal de resultats a retourner (entre 1 et 50).',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
