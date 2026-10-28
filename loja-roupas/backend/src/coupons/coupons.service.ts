import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCouponDto, CouponPreviewDto, UpdateCouponDto } from './coupon.dto';
import { computeCouponDiscount, normalizeCouponCode } from './coupon-rules';

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  async preview(dto: CouponPreviewDto) {
    const quantities = new Map<string, number>();
    for (const item of dto.items) {
      const total = (quantities.get(item.variantId) ?? 0) + item.quantity;
      if (total > 20) throw new BadRequestException('O limite por variação é 20 unidades.');
      quantities.set(item.variantId, total);
    }
    const variants = await this.prisma.productVariant.findMany({ where: { id: { in: [...quantities.keys()] }, active: true, product: { active: true } }, select: { id: true, priceCents: true, stockQty: true } });
    if (variants.length !== quantities.size) throw new BadRequestException('Um ou mais itens não estão disponíveis.');
    let subtotalCents = 0;
    for (const variant of variants) {
      const quantity = quantities.get(variant.id)!;
      if (variant.stockQty < quantity) throw new BadRequestException('Estoque insuficiente para validar o cupom.');
      subtotalCents += variant.priceCents * quantity;
    }
    const code = normalizeCouponCode(dto.code);
    const coupon = await this.prisma.coupon.findUnique({ where: { code } });
    if (!coupon) throw new BadRequestException('Cupom não encontrado.');
    const discountCents = computeCouponDiscount(coupon, subtotalCents);
    return { code: coupon.code, discountCents, subtotalCents, totalCents: subtotalCents - discountCents };
  }

  list() { return this.prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } }); }

  async create(dto: CreateCouponDto) {
    const code = normalizeCouponCode(dto.code);
    if ((dto.type === 'PERCENT' && dto.value > 90) || (dto.type === 'FIXED' && dto.value > 100_000_000)) throw new BadRequestException('O valor do cupom está fora do limite permitido.');
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : new Date();
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (expiresAt && expiresAt <= startsAt) throw new BadRequestException('A validade final precisa ser posterior à data de início.');
    try {
      return await this.prisma.coupon.create({ data: { code, type: dto.type, value: dto.value, minSubtotalCents: dto.minSubtotalCents ?? 0, usageLimit: dto.usageLimit, startsAt, expiresAt } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Já existe um cupom com este código.');
      throw error;
    }
  }

  async update(id: string, dto: UpdateCouponDto) {
    try { return await this.prisma.coupon.update({ where: { id }, data: { active: dto.active } }); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') throw new NotFoundException('Cupom não encontrado.');
      throw error;
    }
  }
}
