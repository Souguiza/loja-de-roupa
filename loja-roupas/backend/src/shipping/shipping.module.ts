import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminShippingController, ShippingController } from './shipping.controller';
import { ShippingService } from './shipping.service';

@Module({ imports: [PrismaModule, AuthModule], controllers: [ShippingController, AdminShippingController], providers: [ShippingService], exports: [ShippingService] })
export class ShippingModule {}
