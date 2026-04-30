import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class WolofTtsDto {
  @ApiProperty({
    example:
      'Nanga def. Bu tension bi yagg ci kaw, woo jàngalekat walla doktoor ngir saytu bu baax.',
    description: 'Texte Wolof à synthétiser en audio.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  text: string;
}

