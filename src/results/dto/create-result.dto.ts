import { IsString, IsOptional, IsEnum, IsMongoId } from 'class-validator';
import { ResultFlagEnum } from '../../database/schemas/result.schema';

export class CreateResultDto {
  @IsMongoId()
  orderId: string;

  @IsOptional()
  @IsMongoId()
  orderTestId?: string;

  @IsString()
  testCode: string;

  @IsString()
  testName: string;

  @IsString()
  value: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsString()
  referenceRange?: string;

  @IsOptional()
  @IsEnum(ResultFlagEnum)
  flag?: ResultFlagEnum;

  @IsOptional()
  @IsString()
  comments?: string;
}
