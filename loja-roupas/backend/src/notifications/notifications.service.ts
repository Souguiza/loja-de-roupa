import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationEvent, NotificationChannel, NotificationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const html = (value: string) => value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const STATUS: Record<NotificationEvent, string> = { ORDER_PAID: 'pagamento confirmado', ORDER_SHIPPED: 'pedido enviado', ORDER_DELIVERED: 'pedido entregue' };

@Injectable()
export class NotificationsService implements OnModuleInit {
  private running = false;
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  onModuleInit() {
    const timer = setInterval(() => void this.drain().catch(() => undefined), 15_000);
    timer.unref();
  }

  async enqueue(tx: Prisma.TransactionClient, orderId: string, event: NotificationEvent, order: { whatsappUpdates: boolean; customer: { email: string | null; phone: string | null } }) {
    const rows: { orderId: string; event: NotificationEvent; channel: NotificationChannel }[] = [];
    if (this.config.get('RESEND_API_KEY') && this.config.get('NOTIFICATION_FROM_EMAIL') && order.customer.email) rows.push({ orderId, event, channel: 'EMAIL' });
    if (order.whatsappUpdates && order.customer.phone && this.whatsappConfigured()) rows.push({ orderId, event, channel: 'WHATSAPP' });
    if (rows.length) await tx.notificationOutbox.createMany({ data: rows, skipDuplicates: true });
  }

  readiness() {
    return {
      email: { configured: Boolean(this.config.get('RESEND_API_KEY') && this.config.get('NOTIFICATION_FROM_EMAIL')), provider: 'Resend' },
      whatsapp: { configured: this.whatsappConfigured(), provider: 'WhatsApp Cloud API', template: this.config.get('WHATSAPP_TEMPLATE_NAME') ?? null },
    };
  }

  private whatsappConfigured() {
    const endpoint = this.config.get<string>('WHATSAPP_MESSAGES_URL') ?? '';
    try { return Boolean(this.config.get('WHATSAPP_ACCESS_TOKEN') && this.config.get('WHATSAPP_TEMPLATE_NAME') && new URL(endpoint).protocol === 'https:' && new URL(endpoint).hostname === 'graph.facebook.com' && !endpoint.includes('vXX.X') && !endpoint.includes('SEU_PHONE')); } catch { return false; }
  }

  private async drain() {
    if (this.running) return;
    this.running = true;
    try {
      await this.prisma.notificationOutbox.updateMany({ where: { status: 'SENDING', updatedAt: { lt: new Date(Date.now() - 10 * 60_000) } }, data: { status: 'PENDING', nextAttemptAt: new Date() } });
      for (let i = 0; i < 20; i++) {
        const row = await this.prisma.notificationOutbox.findFirst({ where: { status: 'PENDING', nextAttemptAt: { lte: new Date() } }, include: { order: { include: { customer: true } } }, orderBy: { createdAt: 'asc' } });
        if (!row) break;
        const claim = await this.prisma.notificationOutbox.updateMany({ where: { id: row.id, status: 'PENDING' }, data: { status: 'SENDING', attempts: { increment: 1 } } });
        if (claim.count !== 1) continue;
        try {
          const result = row.channel === 'EMAIL' ? await this.sendEmail(row) : await this.sendWhatsApp(row);
          await this.prisma.notificationOutbox.update({ where: { id: row.id }, data: { status: 'SENT', sentAt: new Date(), providerMessageId: result ?? null, lastErrorCode: null } });
        } catch (error) {
          const status = row.attempts + 1 >= 8 ? 'FAILED' as const : 'PENDING' as const;
          const code = error instanceof ProviderError ? error.code : 'network_error';
          await this.prisma.notificationOutbox.update({ where: { id: row.id }, data: { status, lastErrorCode: code, nextAttemptAt: new Date(Date.now() + Math.min(6 * 60 * 60_000, 30_000 * 2 ** row.attempts)) } });
        }
      }
    } finally { this.running = false; }
  }

  private orderText(row: { event: NotificationEvent; order: { number: number; trackingCode: string | null; publicToken: string } }) {
    const url = `${this.config.get('PUBLIC_SITE_URL') ?? ''}/pedido/${row.order.publicToken}`;
    return { status: STATUS[row.event], url, tracking: row.order.trackingCode || 'sem código de rastreio', number: String(row.order.number) };
  }

  private async sendEmail(row: any): Promise<string | undefined> {
    const { order } = row;
    const details = this.orderText(row);
    const key = this.config.get<string>('RESEND_API_KEY')!;
    const from = this.config.get<string>('NOTIFICATION_FROM_EMAIL')!;
    const subject = `Agape · pedido #${details.number}: ${details.status}`;
    const text = `Olá, ${order.customer.name}! O ${details.status}. Pedido #${details.number}. Rastreio: ${details.tracking}. Acompanhe: ${details.url}`;
    const safe = html(text);
    const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': `agape-notification-${row.id}` }, body: JSON.stringify({ from, to: [order.customer.email], subject, text, html: `<p>${safe}</p>` }), signal: AbortSignal.timeout(12_000) });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new ProviderError(`http_${response.status}`);
    return typeof data?.id === 'string' ? data.id : undefined;
  }

  private async sendWhatsApp(row: any): Promise<string | undefined> {
    const { order } = row;
    const details = this.orderText(row);
    const digits = String(order.customer.phone ?? '').replace(/\D/g, '');
    const phone = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
    if (phone.length < 12 || phone.length > 15) throw new ProviderError('invalid_phone');
    const endpoint = this.config.get<string>('WHATSAPP_MESSAGES_URL')!;
    const response = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${this.config.get('WHATSAPP_ACCESS_TOKEN')}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to: phone, type: 'template', template: { name: this.config.get('WHATSAPP_TEMPLATE_NAME'), language: { code: this.config.get('WHATSAPP_TEMPLATE_LANGUAGE') || 'pt_BR' }, components: [{ type: 'body', parameters: [{ type: 'text', text: details.number }, { type: 'text', text: details.status }, { type: 'text', text: details.tracking }, { type: 'text', text: details.url }] }] } }), signal: AbortSignal.timeout(12_000) });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new ProviderError(`http_${response.status}`);
    return typeof data?.messages?.[0]?.id === 'string' ? data.messages[0].id : undefined;
  }
}

class ProviderError extends Error { constructor(readonly code: string) { super(code); } }
