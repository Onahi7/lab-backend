import { IsBoolean, IsEmail, IsOptional, IsString } from 'class-validator';

export class CreateApiClientDto {
  @IsString()
  facilityName: string;

  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
