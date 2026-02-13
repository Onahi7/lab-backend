import {
  IsString,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  ValidateNested,
  Min,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  PriorityEnum,
  DiscountTypeEnum,
  PaymentMethodEnum,
} from '../../database/schemas/order.schema';

export class OrderTestDto {
  @IsString()
  testId: string;

  @IsString()
  testCode: string;

  @IsString()
  testName: string;

  @IsNumber()
  @Min(0)
  price: number;
}

export class CreateOrderDto {
  @IsString()
  patientId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderTestDto)
  tests: OrderTestDto[];

  @IsEnum(PriorityEnum)
  priority: PriorityEnum;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @IsOptional()
  @IsEnum(DiscountTypeEnum)
  discountType?: DiscountTypeEnum;

  @IsOptional()
  @IsEnum(PaymentMethodEnum)
  paymentMethod?: PaymentMethodEnum;

  @IsOptional()
  @IsString()
  notes?: string;
}
