import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'awa.diallo@akacare.app' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Akacare@123' })
  @IsString()
  password: string;
}
