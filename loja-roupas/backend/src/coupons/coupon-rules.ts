import { BadRequestException } from '@nestjs/common';
import { CouponType } from '@prisma/client';

export type CouponLike = {
  code: string; type: CouponType; value: number; minSubtotalCents: number; usageLimit: number | null;
  usedCount: number; startsAt: Date; expiresAt: Date | null; active: boolean;
};

export function normalizeCouponCode(code: string) {
  return code.trim().toUpperCase();
}

export function computeCouponDiscount(coupon: CouponLike, subtotalCents: number, now = new Date()) {
  if (!coupon.active || coupon.startsAt > now || (coupon.expiresAt && coupon.expiresAt <= now)) throw new BadRequestException('Este cupom não está ativo.');
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) throw new BadRequestException('Este cupom atingiu o limite de utilizações.');
  if (subtotalCents < coupon.minSubtotalCents) throw new BadRequestException(`O pedido precisa ter pelo menos R$ ${(coupon.minSubtotalCents / 100).toFixed(2).replace('.', ',')} em produtos para usar este cupom.`);
  const discount = coupon.type === CouponType.PERCENT
    ? Math.floor(subtotalCents * coupon.value / 100)
    : Math.min(coupon.value, Math.max(0, subtotalCents - 1));
  if (!Number.isSafeInteger(discount) || discount <= 0 || discount >= subtotalCents) throw new BadRequestException('O cupom não gera um desconto válido para este pedido.');
  return discount;
}
