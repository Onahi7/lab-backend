import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  AgeUnitEnum,
  GenderEnum,
} from '../../database/schemas/patient.schema';
import {
  DiscountTypeEnum,
  PaymentMethodEnum,
  PriorityEnum,
} from '../../database/schemas/order.schema';

export class FacilityPatientDto {
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsNumber()
  @Min(0)
  @Max(150)
  age: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(54750)
  ageValue?: number;

  @IsOptional()
  @IsEnum(AgeUnitEnum)
  ageUnit?: AgeUnitEnum;

  @IsEnum(GenderEnum)
  gender: GenderEnum;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  mrn?: string;
}

export class FacilityRequestedTestDto {
  @IsString()
  @IsNotEmpty()
  code: string;
}

export class FacilityInitialPaymentDto {
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsEnum(PaymentMethodEnum)
  paymentMethod: PaymentMethodEnum;
}

export class CreateFacilityTestRequestDto {
  @IsString()
  @IsNotEmpty()
  externalRequestId: string;

  @IsOptional()
  @IsString()
  sourceSystem?: string;

  @IsOptional()
  @IsString()
  sourceFacilityName?: string;

  @IsOptional()
  @IsString()
  sourceFacilityLocation?: string;

  @ValidateNested()
  @Type(() => FacilityPatientDto)
  patient: FacilityPatientDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FacilityRequestedTestDto)
  tests: FacilityRequestedTestDto[];

  @IsOptional()
  @IsEnum(PriorityEnum)
  priority?: PriorityEnum;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @IsOptional()
  @IsEnum(DiscountTypeEnum)
  discountType?: DiscountTypeEnum;

  @IsOptional()
  @ValidateNested()
  @Type(() => FacilityInitialPaymentDto)
  payment?: FacilityInitialPaymentDto;

  @IsOptional()
  @IsString()
  referredByDoctor?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
