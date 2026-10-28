import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { CouponPreviewDto, CreateCouponDto, UpdateCouponDto } from './coupon.dto';
import { CouponsService } from './coupons.service';

@Controller('coupons')
export class CouponsController {
  constructor(private readonly coupons: CouponsService) {}
  @Post('validate') preview(@Body() dto: CouponPreviewDto) { return this.coupons.preview(dto); }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('owner', 'staff')
@Controller('admin/coupons')
export class AdminCouponsController {
  constructor(private readonly coupons: CouponsService) {}
  @Get() list() { return this.coupons.list(); }
  @Post() create(@Body() dto: CreateCouponDto) { return this.coupons.create(dto); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateCouponDto) { return this.coupons.update(id, dto); }
}
