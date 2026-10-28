import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsEmail, IsIn, IsInt, IsOptional,
  IsBoolean, IsString, Length, Matches, Min, MinLength, ValidateNested,
} from 'class-validator';

export class OrderLineDto {
  @IsString() @MinLength(1) variantId: string;
  @IsInt() @Min(1) quantity: number;
}

export class ShippingAddressDto {
  @IsString() @MinLength(2) street: string;
  @IsString() @MinLength(1) number: string;
  @IsOptional() @IsString() complement?: string;
  @IsString() @MinLength(2) neighborhood: string;
  @IsString() @MinLength(2) city: string;
  @IsString() @Length(2, 2) state: string;
  @Matches(/^\d{8}$/) cep: string;
}

export class CreateOrderDto {
  @IsString() @MinLength(2) name: string;
  @IsEmail() email: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsBoolean() whatsappUpdates?: boolean;
  @IsString() @MinLength(1) shippingQuoteId: string;
  @IsOptional() @IsString() @Length(3, 32) @Matches(/^[A-Za-z0-9_-]+$/) couponCode?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => OrderLineDto)
  items: OrderLineDto[];
  @ValidateNested() @Type(() => ShippingAddressDto) address: ShippingAddressDto;
}

export class UpdateOrderDto {
  @IsIn(['PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELED']) status: 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELED';
  @IsOptional() @IsString() @Length(3, 80) trackingCode?: string;
}
