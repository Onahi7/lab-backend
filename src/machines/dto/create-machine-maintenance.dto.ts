import { IsString, IsEnum, IsOptional, IsDateString } from 'class-validator';

export class CreateMachineMaintenanceDto {
  @IsString()
  @IsOptional()
  machineId?: string;

  @IsEnum(['preventive', 'corrective', 'calibration', 'other'])
  maintenanceType: string;

  @IsString()
  description: string;

  @IsString()
  @IsOptional()
  performedBy?: string;

  @IsDateString()
  @IsOptional()
  scheduledDate?: string;

  @IsDateString()
  @IsOptional()
  completedDate?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
