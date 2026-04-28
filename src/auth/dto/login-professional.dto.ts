import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString } from 'class-validator';

export class LoginProfessionalDto {
  @ApiProperty({ example: 'madie@gmail.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'akkassa2026' })
  @IsString()
  password: string;
}
