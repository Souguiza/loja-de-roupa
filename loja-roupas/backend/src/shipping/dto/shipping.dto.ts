import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsString, Matches, Min, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ShippingQuoteLineDto {
  @IsString() @MinLength(1) variantId: string;
  @IsInt() @Min(1) quantity: number;
}

export class ShippingQuoteDto {
  @Matches(/^\d{8}$/) cep: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => ShippingQuoteLineDto)
  items: ShippingQuoteLineDto[];
}
