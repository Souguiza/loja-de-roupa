import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUrl, Length, Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';

const HEX = /^#[0-9a-fA-F]{6}$/;

export class CreateVariantDto {
  @IsString() @Length(1, 12) @Matches(/^[a-zA-Z0-9]+$/) size: string;
  @IsString() @Length(1, 40) color: string;
  @Matches(HEX, { message: 'colorHex deve ser no formato #rrggbb' }) colorHex: string;
  @IsInt() @Min(0) priceCents: number;
  @IsOptional() @IsInt() @Min(0) compareAtPriceCents?: number;
  @IsInt() @Min(0) stockQty: number;
  @IsOptional() @IsString() sku?: string;
}

export class ProductImageDto {
  // Localhost permits local owner previews; all remote catalog images must use HTTPS.
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true, require_tld: false })
  @Matches(/^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/)/, { message: 'Imagens remotas devem usar HTTPS.' }) url: string;
  @IsOptional() @IsInt() @Min(0) position?: number;
}

export class CreateProductDto {
  @IsString() @Length(2, 120) name: string;
  @IsOptional() @IsString() slug?: string;
  @IsOptional() @IsString() @MaxLength(3000) description?: string;
  @IsString() @Length(1, 100) categoryId: string;
  @IsIn(['tee', 'long', 'tank']) shape: 'tee' | 'long' | 'tank';
  @IsOptional() @IsBoolean() hasPrint?: boolean;
  @IsInt() @Min(1) @Max(30000) shippingWeightGrams: number;
  @IsInt() @Min(1) @Max(200) shippingWidthCm: number;
  @IsInt() @Min(1) @Max(200) shippingHeightCm: number;
  @IsInt() @Min(1) @Max(200) shippingLengthCm: number;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => ProductImageDto)
  images?: ProductImageDto[];
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => CreateVariantDto)
  variants: CreateVariantDto[];
}

export class UpdateProductDto {
  @IsOptional() @IsString() @Length(2, 120) name?: string;
  @IsOptional() @IsString() @MaxLength(3000) description?: string;
  @IsOptional() @IsString() @Length(1, 100) categoryId?: string;
  @IsOptional() @IsIn(['tee', 'long', 'tank']) shape?: 'tee' | 'long' | 'tank';
  @IsOptional() @IsBoolean() hasPrint?: boolean;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(30000) shippingWeightGrams?: number;
  @IsOptional() @IsInt() @Min(1) @Max(200) shippingWidthCm?: number;
  @IsOptional() @IsInt() @Min(1) @Max(200) shippingHeightCm?: number;
  @IsOptional() @IsInt() @Min(1) @Max(200) shippingLengthCm?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => ProductImageDto)
  images?: ProductImageDto[];
}

export class UpdateVariantDto {
  @IsOptional() @IsInt() @Min(0) priceCents?: number;
  @IsOptional() @IsInt() @Min(0) compareAtPriceCents?: number;
  @IsOptional() @IsInt() @Min(0) stockQty?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class CreateCategoryDto {
  @IsString() @Length(2, 120) name: string;
  @IsOptional() @IsString() slug?: string;
}

export class UpdateCategoryDto {
  @IsOptional() @IsString() @Length(2, 120) name?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}
