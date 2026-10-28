import { BadRequestException, Injectable, NotFoundException, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ShippingService } from '../shipping/shipping.service';
import { computeCouponDiscount, normalizeCouponCode } from '../coupons/coupon-rules';
import { CreateOrderDto, UpdateOrderDto } from './dto/create-order.dto';
import { NotificationsService } from '../notifications/notifications.service';

type CheckoutLine = { item: { variantId: string; quantity: number }; variant: { id: string; priceCents: number; color: string; size: string; product: { name: string } } };

function preferenceItems(lines: CheckoutLine[], discountCents: number, subtotalCents: number) {
  const shares = lines.map((line) => {
    const lineTotal = line.variant.priceCents * line.item.quantity;
    const exactShare = subtotalCents ? discountCents * lineTotal / subtotalCents : 0;
    const discount = Math.min(lineTotal - 1, Math.floor(exactShare));
    return { ...line, lineTotal, discount, remainder: exactShare - Math.floor(exactShare) };
  });
  let remaining = discountCents - shares.reduce((sum, line) => sum + line.discount, 0);
  while (remaining > 0) {
    const candidate = shares.filter((line) => line.discount < line.lineTotal - 1).sort((a, b) => b.remainder - a.remainder)[0];
    if (!candidate) throw new BadRequestException('Não foi possível distribuir o desconto do cupom.');
    candidate.discount++; candidate.remainder = -1; remaining--;
  }
  return shares.flatMap((line) => {
    const netCents = line.lineTotal - line.discount;
    const regularUnitCents = Math.floor(netCents / line.item.quantity);
    const extraCentUnits = netCents % line.item.quantity;
    const title = `${line.variant.product.name} · ${line.variant.color} / ${line.variant.size}`;
    const items = [];
    if (line.item.quantity > extraCentUnits) items.push({ id: line.variant.id, title, quantity: line.item.quantity - extraCentUnits, currency_id: 'BRL', unit_price: regularUnitCents / 100 });
    if (extraCentUnits > 0) items.push({ id: `${line.variant.id}-centavo`, title, quantity: extraCentUnits, currency_id: 'BRL', unit_price: (regularUnitCents + 1) / 100 });
    return items;
  });
}

@Injectable()
export class OrdersService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService, private readonly shipping: ShippingService, private readonly notifications: NotificationsService) {}

  onModuleInit() {
    const timer = setInterval(() => void this.expireUnpaidOrders().catch(() => undefined), 60_000);
    timer.unref();
  }

  private async expireUnpaidOrders() {
    const stale = await this.prisma.order.findMany({ where: { status: 'AWAITING_PAYMENT', createdAt: { lt: new Date(Date.now() - 35 * 60_000) } }, include: { items: true }, take: 50 });
    for (const order of stale) await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({ where: { id: order.id, status: 'AWAITING_PAYMENT' }, data: { status: 'CANCELED' } });
      if (claimed.count !== 1) return;
      for (const item of order.items) await tx.productVariant.update({ where: { id: item.variantId }, data: { stockQty: { increment: item.quantity } } });
      if (order.couponId) await tx.coupon.updateMany({ where: { id: order.couponId, usedCount: { gt: 0 } }, data: { usedCount: { decrement: 1 } } });
    });
  }

  async create(dto: CreateOrderDto) {
    if (dto.whatsappUpdates && !dto.phone?.trim()) throw new BadRequestException('Informe um telefone para receber atualizações pelo WhatsApp.');
    if (this.config.get<string>('CHECKOUT_ENABLED') !== 'true') {
      throw new ServiceUnavailableException('Checkout temporariamente indisponível. Tente novamente mais tarde.');
    }
    const token = this.config.get<string>('MERCADO_PAGO_ACCESS_TOKEN');
    const webhook = this.config.get<string>('MERCADO_PAGO_WEBHOOK_SECRET');
    const notificationUrl = this.config.get<string>('MERCADO_PAGO_NOTIFICATION_URL');
    const siteUrl = this.config.get<string>('PUBLIC_SITE_URL');
    if (!token || !webhook || !notificationUrl?.startsWith('https://') || !siteUrl?.startsWith('https://')) throw new ServiceUnavailableException('Configure Mercado Pago e URLs HTTPS públicas antes de habilitar o checkout.');
    const items = this.shipping.normalizeItems(dto.items);
    const quote = await this.prisma.shippingQuote.findFirst({ where: { id: dto.shippingQuoteId, destinationCep: dto.address.cep, expiresAt: { gt: new Date() }, consumedAt: null } });
    if (!quote || JSON.stringify(quote.items) !== JSON.stringify(items)) throw new BadRequestException('Frete expirado ou diferente dos itens. Calcule novamente.');
    const variants = await this.prisma.productVariant.findMany({ where: { id: { in: items.map((item) => item.variantId) }, active: true, product: { active: true } }, include: { product: true } });
    if (variants.length !== items.length) throw new BadRequestException('Um ou mais itens não estão disponíveis.');
    const lines = items.map((item) => {
      const variant = variants.find((candidate) => candidate.id === item.variantId)!;
      if (variant.stockQty < item.quantity) throw new BadRequestException(`Estoque insuficiente para ${variant.product.name} / ${variant.size}.`);
      return { item, variant };
    });
    const subtotalCents = lines.reduce((sum, line) => sum + line.variant.priceCents * line.item.quantity, 0);
    const couponCode = dto.couponCode ? normalizeCouponCode(dto.couponCode) : null;
    let discountCents = 0;
    let totalCents = subtotalCents + quote.priceCents;
    const order = await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.shippingQuote.updateMany({ where: { id: quote.id, consumedAt: null, expiresAt: { gt: new Date() } }, data: { consumedAt: new Date() } });
      if (consumed.count !== 1) throw new BadRequestException('Frete já utilizado. Calcule novamente.');
      const customer = await tx.customer.upsert({ where: { email: dto.email.toLowerCase() }, create: { name: dto.name, email: dto.email.toLowerCase(), phone: dto.phone || null }, update: { name: dto.name, phone: dto.phone || undefined } });
      for (const { item, variant } of lines) {
        const changed = await tx.productVariant.updateMany({ where: { id: variant.id, priceCents: variant.priceCents, stockQty: { gte: item.quantity } }, data: { stockQty: { decrement: item.quantity } } });
        if (changed.count !== 1) throw new BadRequestException('Estoque alterado. Atualize sua sacola.');
      }
      let couponId: string | null = null;
      if (couponCode) {
        const coupon = await tx.coupon.findUnique({ where: { code: couponCode } });
        if (!coupon) throw new BadRequestException('Cupom não encontrado.');
        const couponCheckedAt = new Date();
        discountCents = computeCouponDiscount(coupon, subtotalCents, couponCheckedAt);
        const used = await tx.coupon.updateMany({ where: {
          id: coupon.id, active: true, type: coupon.type, value: coupon.value,
          minSubtotalCents: coupon.minSubtotalCents, startsAt: { equals: coupon.startsAt, lte: couponCheckedAt },
          expiresAt: coupon.expiresAt === null ? null : { equals: coupon.expiresAt, gt: couponCheckedAt },
          usageLimit: coupon.usageLimit,
          ...(coupon.usageLimit === null ? {} : { usedCount: { lt: coupon.usageLimit } }),
        }, data: { usedCount: { increment: 1 } } });
        if (used.count !== 1) throw new BadRequestException('Este cupom acabou de atingir o limite. Tente outro.');
        couponId = coupon.id;
      }
      totalCents = subtotalCents - discountCents + quote.priceCents;
      return tx.order.create({ data: {
        customerId: customer.id, whatsappUpdates: dto.whatsappUpdates === true, couponId, couponCode, subtotalCents, shippingCents: quote.priceCents, discountCents, totalCents,
        shippingQuoteId: quote.id,
        shippingMethod: `${quote.companyName} · ${quote.serviceName}`,
        shippingAddress: { ...dto.address, cep: dto.address.cep },
        items: { create: lines.map(({ item, variant }) => ({ variantId: variant.id, productName: variant.product.name, size: variant.size, color: variant.color, unitPriceCents: variant.priceCents, quantity: item.quantity })) },
        payments: { create: { provider: 'mercado_pago', method: 'CHECKOUT_PRO', amountCents: totalCents } },
      }, include: { items: true, payments: true } });
    });
    let prefRes: Response;
    try { prefRes = await fetch('https://api.mercadopago.com/checkout/preferences', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Idempotency-Key': order.id }, body: JSON.stringify({
      external_reference: order.id, notification_url: notificationUrl, expires: true,
      expiration_date_from: new Date().toISOString(), expiration_date_to: new Date(Date.now() + 30 * 60_000).toISOString(),
      payment_methods: { default_payment_method_id: 'pix' },
      auto_return: 'approved', back_urls: { success: `${siteUrl}/pedido/${order.publicToken}`, pending: `${siteUrl}/pedido/${order.publicToken}`, failure: `${siteUrl}/pedido/${order.publicToken}` },
      items: [...preferenceItems(lines, discountCents, subtotalCents), { id: `frete-${quote.id}`, title: `Frete ${quote.companyName} · ${quote.serviceName}`, quantity: 1, currency_id: 'BRL', unit_price: quote.priceCents / 100 }],
    }), signal: AbortSignal.timeout(12000) }); }
    catch {
      await this.cancelAndRestock(order.id);
      throw new ServiceUnavailableException('Não foi possível conectar ao Mercado Pago. Tente novamente.');
    }
    const preference = await prefRes.json().catch(() => null);
    if (!prefRes.ok || typeof preference?.init_point !== 'string' || typeof preference?.id !== 'string') {
      await this.cancelAndRestock(order.id);
      throw new ServiceUnavailableException('O Mercado Pago não conseguiu iniciar o pagamento. Tente novamente.');
    }
    await this.prisma.payment.updateMany({ where: { orderId: order.id }, data: { providerPreferenceId: preference.id } });
    return { number: order.number, checkoutUrl: preference.init_point, publicToken: order.publicToken };
  }

  async mercadoPagoWebhook(dataId: string, requestId: string, signature: string) {
    const secret = this.config.get<string>('MERCADO_PAGO_WEBHOOK_SECRET');
    const token = this.config.get<string>('MERCADO_PAGO_ACCESS_TOKEN');
    if (!secret || !token || !/^\d+$/.test(dataId) || !requestId || requestId.length > 200) throw new BadRequestException('Notificação inválida.');
    if (typeof signature !== 'string' || signature.length > 512) throw new BadRequestException('Assinatura inválida.');
    const parts = Object.fromEntries(signature.split(',').map((part) => part.trim().split('=').map((v) => v.trim())));
    const ts = parts.ts; const hash = parts.v1;
    if (!ts || !hash || Math.abs(Date.now() - Number(ts) * 1000) > 5 * 60_000) throw new BadRequestException('Assinatura inválida.');
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const expected = createHmac('sha256', secret).update(manifest).digest();
    let received: Buffer; try { received = Buffer.from(hash, 'hex'); } catch { throw new BadRequestException('Assinatura inválida.'); }
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) throw new BadRequestException('Assinatura inválida.');
    const response = await fetch(`https://api.mercadopago.com/v1/payments/${dataId}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(12000) });
    const payment = await response.json().catch(() => null);
    if (!response.ok || typeof payment?.external_reference !== 'string' || !Number.isFinite(payment?.transaction_amount)) throw new BadRequestException('Pagamento não encontrado.');
    const order = await this.prisma.order.findUnique({ where: { id: payment.external_reference }, include: { payments: true, customer: true } });
    if (!order) throw new BadRequestException('Pedido não encontrado.');
    const record = order.payments.find((p) => p.provider === 'mercado_pago');
    if (!record) throw new BadRequestException('Pagamento não encontrado.');
    if (!record.providerPreferenceId || String(payment.preference_id) !== record.providerPreferenceId) throw new BadRequestException('A preferência não corresponde a este pedido.');
    if (Math.round(payment.transaction_amount * 100) !== record.amountCents || payment.currency_id !== 'BRL') throw new BadRequestException('Valor do pagamento não confere.');
    if (payment.status === 'approved' && order.status === 'CANCELED') {
      await this.refundCanceledPayment(dataId, order.id, record.id, String(payment.id), token);
      return { received: true, refunded: true };
    }
    if (payment.status === 'approved' && order.status === 'PAID' && record.providerPaymentId !== String(payment.id)) {
      await this.requestProviderRefund(dataId, order.id, token);
      return { received: true, refunded: true, duplicatePayment: true };
    }
    if (payment.status === 'approved' && order.status === 'AWAITING_PAYMENT') await this.prisma.$transaction(async (tx) => {
      const changed = await tx.order.updateMany({ where: { id: order.id, status: 'AWAITING_PAYMENT' }, data: { status: 'PAID' } });
      if (changed.count !== 1) return false;
      await tx.payment.update({ where: { id: record.id }, data: { status: 'APPROVED', providerPaymentId: String(payment.id), paidAt: new Date(payment.date_approved ?? Date.now()) } });
      await tx.stockReservation.deleteMany({ where: { orderId: order.id } });
      await this.notifications.enqueue(tx, order.id, 'ORDER_PAID', order);
      return true;
    }).then(async (approved) => {
      if (approved) return;
      const current = await this.prisma.order.findUnique({ where: { id: order.id }, select: { status: true, payments: { where: { provider: 'mercado_pago' }, select: { providerPaymentId: true } } } });
      if (current?.status === 'CANCELED') await this.refundCanceledPayment(dataId, order.id, record.id, String(payment.id), token);
      else if (current?.status === 'PAID' && current.payments[0]?.providerPaymentId !== String(payment.id)) await this.requestProviderRefund(dataId, order.id, token);
    });
    if ((payment.status === 'rejected' || payment.status === 'cancelled') && order.status === 'AWAITING_PAYMENT') await this.prisma.payment.update({ where: { id: record.id }, data: { status: 'REFUSED', providerPaymentId: String(payment.id) } });
    return { received: true };
  }

  private async cancelAndRestock(orderId: string) {
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
      if (!order || order.status !== 'AWAITING_PAYMENT') return;
      const claimed = await tx.order.updateMany({ where: { id: orderId, status: 'AWAITING_PAYMENT' }, data: { status: 'CANCELED' } });
      if (claimed.count !== 1) return;
      for (const item of order.items) await tx.productVariant.update({ where: { id: item.variantId }, data: { stockQty: { increment: item.quantity } } });
      if (order.couponId) await tx.coupon.updateMany({ where: { id: order.couponId, usedCount: { gt: 0 } }, data: { usedCount: { decrement: 1 } } });
    });
  }

  private async refundCanceledPayment(dataId: string, orderId: string, paymentRecordId: string, providerPaymentId: string, token: string) {
    await this.requestProviderRefund(dataId, orderId, token);
    await this.prisma.payment.updateMany({ where: { id: paymentRecordId }, data: { status: 'REFUNDED', providerPaymentId } });
  }

  private async requestProviderRefund(dataId: string, orderId: string, token: string) {
    const refund = await fetch(`https://api.mercadopago.com/v1/payments/${dataId}/refunds`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Idempotency-Key': `refund-${dataId}` }, body: '{}', signal: AbortSignal.timeout(12000) });
    if (!refund.ok) throw new ServiceUnavailableException(`O pagamento do pedido ${orderId} não pôde ser estornado automaticamente e precisa ser revisado no Mercado Pago.`);
  }

  async list(requestedPage = 1) {
    const pageSize = 50;
    if (!Number.isSafeInteger(requestedPage) || requestedPage < 1) throw new BadRequestException('Página de pedidos inválida.');
    const total = await this.prisma.order.count();
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, pageCount);
    const items = await this.prisma.order.findMany({
      select: {
        id: true, number: true, status: true, totalCents: true, shippingAddress: true,
        trackingCode: true, createdAt: true, shippingLabelId: true, shippingLabelStatus: true,
        customer: { select: { name: true, email: true, phone: true } },
        items: { select: { productName: true, size: true, color: true, quantity: true } },
        shippingQuote: { select: { companyName: true, serviceName: true, priceCents: true, deliveryDays: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { items, total, page, pageSize, pageCount };
  }

  async summary() {
    const [activeOrderCount, waitingPaymentCount, lowStockVariantCount, pendingReviewCount, recentOrders] = await Promise.all([
      this.prisma.order.count({ where: { status: { in: ['PAID', 'PROCESSING', 'SHIPPED'] } } }),
      this.prisma.order.count({ where: { status: 'AWAITING_PAYMENT' } }),
      this.prisma.productVariant.count({ where: { active: true, stockQty: { lte: 2 }, product: { active: true, category: { active: true } } } }),
      this.prisma.review.count({ where: { status: 'PENDING' } }),
      this.prisma.order.findMany({
        take: 4,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true, number: true, status: true, createdAt: true,
          customer: { select: { name: true } },
          items: { select: { quantity: true } },
        },
      }),
    ]);
    return { activeOrderCount, waitingPaymentCount, lowStockVariantCount, pendingReviewCount, recentOrders };
  }

  async publicStatus(token: string) {
    const order = await this.prisma.order.findUnique({ where: { publicToken: token }, select: { number: true, status: true, totalCents: true, shippingMethod: true, trackingCode: true, createdAt: true, items: { select: { variantId: true, productName: true, unitPriceCents: true, size: true, color: true, quantity: true, variant: { select: { product: { select: { slug: true } } } } } }, payments: { select: { status: true, method: true, paidAt: true } } } });
    if (!order) throw new NotFoundException('Pedido não encontrado.');
    return order;
  }

  listCustomers() {
    return this.prisma.customer.findMany({
      select: {
        id: true, name: true, email: true, phone: true, createdAt: true,
        _count: { select: { orders: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(id: string, dto: UpdateOrderDto) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: { items: true, customer: true } });
    if (!order) throw new NotFoundException('Pedido não encontrado');
    if (order.status === 'CANCELED' && dto.status !== 'CANCELED') {
      throw new BadRequestException('Um pedido cancelado não pode ser reaberto');
    }
    if (dto.status === 'CANCELED' && (order.shippingLabelId || order.shippingLabelStatus)) {
      throw new BadRequestException('Este pedido já iniciou a expedição. Confira/cancele o envio no Melhor Envio antes de qualquer cancelamento.');
    }
    if (dto.status === 'CANCELED' && order.status !== 'AWAITING_PAYMENT') throw new BadRequestException('Pedidos com pagamento confirmado precisam de fluxo de estorno antes do cancelamento.');
    if (dto.status === 'SHIPPED' && !dto.trackingCode?.trim() && !order.trackingCode) throw new BadRequestException('Informe o código de rastreio antes de marcar como enviado.');
    const allowedNext: Record<string, string[]> = { PAID: ['PROCESSING'], PROCESSING: ['SHIPPED'], SHIPPED: ['DELIVERED'], DELIVERED: [], AWAITING_PAYMENT: [] };
    const trackingUpdate = dto.status === order.status && dto.status === 'SHIPPED' && dto.trackingCode !== undefined;
    if (dto.status !== 'CANCELED' && !trackingUpdate && !allowedNext[order.status]?.includes(dto.status)) throw new BadRequestException('Transição de status inválida para este pedido.');
    return this.prisma.$transaction(async (tx) => {
      if (dto.status === 'CANCELED' && order.status !== 'CANCELED') {
        const claimed = await tx.order.updateMany({ where: { id, status: order.status }, data: { status: 'CANCELED' } });
        if (claimed.count !== 1) throw new BadRequestException('O pedido foi alterado por outra operação. Atualize a lista.');
        for (const item of order.items) {
          await tx.productVariant.update({ where: { id: item.variantId }, data: { stockQty: { increment: item.quantity } } });
        }
        if (order.couponId) await tx.coupon.updateMany({ where: { id: order.couponId, usedCount: { gt: 0 } }, data: { usedCount: { decrement: 1 } } });
        return tx.order.findUniqueOrThrow({ where: { id } });
      }
      const changed = await tx.order.updateMany({
        where: { id, status: order.status },
        data: { status: dto.status, ...(dto.trackingCode !== undefined ? { trackingCode: dto.trackingCode } : {}) },
      });
      if (changed.count !== 1) throw new BadRequestException('O pedido foi alterado por outra operação. Atualize a lista.');
      const updated = await tx.order.findUniqueOrThrow({ where: { id }, include: { customer: true } });
      if (order.status !== dto.status && dto.status === 'SHIPPED') await this.notifications.enqueue(tx, id, 'ORDER_SHIPPED', updated);
      if (order.status !== dto.status && dto.status === 'DELIVERED') await this.notifications.enqueue(tx, id, 'ORDER_DELIVERED', updated);
      return updated;
    });
  }
}
