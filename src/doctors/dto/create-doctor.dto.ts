import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateDoctorDto {
  @IsString()
  fullName: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  facility?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
