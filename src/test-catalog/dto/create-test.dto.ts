import { IsString, IsEnum, IsNumber, IsOptional, IsBoolean, Min } from 'class-validator';
import { TestCategoryEnum } from '../../database/schemas/test-catalog.schema';
import { SampleTypeEnum } from '../../database/schemas/sample.schema';
import { Types } from 'mongoose';

export class CreateTestDto {
  @IsString()
  code: string;

  @IsString()
  name: string;

  @IsEnum(TestCategoryEnum)
  category: TestCategoryEnum;

  @IsEnum(SampleTypeEnum)
  sampleType: SampleTypeEnum;

  @IsNumber()
  @Min(0)
  price: number;

  @IsString()
  @IsOptional()
  unit?: string;

  @IsString()
  @IsOptional()
  referenceRange?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  turnaroundTime?: number;

  @IsString()
  @IsOptional()
  machineId?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
