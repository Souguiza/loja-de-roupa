import { Body, Controller, Get, Param, Patch, Post, Query, Headers, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { CreateOrderDto, UpdateOrderDto } from './dto/create-order.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(@Body() dto: CreateOrderDto) { return this.orders.create(dto); }

  @Post('webhook/mercado-pago')
  webhook(@Query('data.id') dataId: string, @Headers('x-request-id') requestId: string, @Headers('x-signature') signature: string) {
    return this.orders.mercadoPagoWebhook(dataId, requestId, signature);
  }

  @Get('status/:token')
  status(@Param('token') token: string) { return this.orders.publicStatus(token); }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('owner', 'staff')
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(@Query('page') page?: string) { return this.orders.list(page === undefined ? 1 : Number(page)); }

  @Get('summary')
  summary() { return this.orders.summary(); }

  @Get('customers')
  customers() { return this.orders.listCustomers(); }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateOrderDto) { return this.orders.update(id, dto); }
}
