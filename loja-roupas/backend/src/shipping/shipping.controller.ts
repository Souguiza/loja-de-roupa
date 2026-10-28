import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { ShippingQuoteDto } from './dto/shipping.dto';
import { CreateShippingLabelDto } from './dto/shipping-label.dto';
import { ShippingService } from './shipping.service';

@Controller('shipping')
export class ShippingController {
  constructor(private readonly shipping: ShippingService) {}

  @Post('quote')
  quote(@Body() dto: ShippingQuoteDto) { return this.shipping.quote(dto); }

  @Get('callback')
  callback(@Query('code') code: string, @Query('state') state: string) {
    return this.shipping.completeAuthorization(code, state);
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('owner', 'staff')
@Controller('admin/shipping')
export class AdminShippingController {
  constructor(private readonly shipping: ShippingService) {}

  @Get('status')
  status() { return this.shipping.status(); }

  @Get('authorize')
  authorize() { return this.shipping.getAuthorizationUrl(); }

  @Post('orders/:id/label')
  prepareLabel(@Param('id') id: string, @Body() dto: CreateShippingLabelDto) { return this.shipping.prepareOrderLabel(id, dto); }

  @Post('orders/:id/label/purchase')
  purchaseLabel(@Param('id') id: string) { return this.shipping.purchaseOrderLabel(id); }

  @Post('orders/:id/label/generate')
  generateLabel(@Param('id') id: string) { return this.shipping.generateOrderLabel(id); }

  @Post('orders/:id/label/print')
  printLabel(@Param('id') id: string) { return this.shipping.printOrderLabel(id); }

  @Post('orders/:id/label/tracking')
  tracking(@Param('id') id: string) { return this.shipping.refreshOrderTracking(id); }
}
