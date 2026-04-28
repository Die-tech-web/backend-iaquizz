import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterProfessionalDto {
  @ApiProperty({ example: 'madie@gmail.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'akkassa2026', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ example: 'Madie' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Akassa' })
  @IsString()
  lastName: string;

  @ApiPropertyOptional({ example: 'Nephrologie' })
  @IsOptional()
  @IsString()
  specialty?: string;

  @ApiPropertyOptional({ example: 'Hopital Principal de Dakar' })
  @IsOptional()
  @IsString()
  facilityName?: string;

  @ApiPropertyOptional({ example: 'ORD-2026-00123' })
  @IsOptional()
  @IsString()
  licenseNumber?: string;
}
