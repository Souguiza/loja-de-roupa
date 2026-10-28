import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Matches, Min, ValidateNested, IsDateString, Max } from 'class-validator';

export class CouponPreviewLineDto {
  @IsString() @Length(1, 100) variantId: string;
  @IsInt() @Min(1) @Max(20) quantity: number;
}

export class CouponPreviewDto {
  @IsString() @Length(3, 32) @Matches(/^[A-Za-z0-9_-]+$/) code: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => CouponPreviewLineDto)
  items: CouponPreviewLineDto[];
}

export class CreateCouponDto {
  @IsString() @Length(3, 32) @Matches(/^[A-Za-z0-9_-]+$/) code: string;
  @IsIn(['PERCENT', 'FIXED']) type: 'PERCENT' | 'FIXED';
  @IsInt() @Min(1) value: number;
  @IsOptional() @IsInt() @Min(0) minSubtotalCents?: number;
  @IsOptional() @IsInt() @Min(1) usageLimit?: number;
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsDateString() expiresAt?: string;
}

export class UpdateCouponDto {
  @IsBoolean() active: boolean;
}
