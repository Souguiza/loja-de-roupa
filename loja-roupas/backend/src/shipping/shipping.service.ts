import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { ShippingQuoteDto } from './dto/shipping.dto';
import { CreateShippingLabelDto } from './dto/shipping-label.dto';

type MeTokenResponse = { access_token: string; refresh_token: string; expires_in: number };
type MeRate = {
  id: number; name: string; custom_price?: string | number; price?: string | number;
  custom_delivery_time?: number; delivery_time?: number; company?: { name?: string };
  packages?: unknown[];
};

const tokenId = 'melhor-envio';
const quoteTtlMs = 10 * 60 * 1000;
const moneyToCents = (value: unknown) => Math.round(Number(value) * 100);
const labelInProgressStatuses = ['PREPARING', 'PURCHASING', 'GENERATING'];

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function responseEntries(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const record = objectRecord(value);
  if (!record) return [];
  if (Array.isArray(record.data)) return record.data;
  if (Array.isArray(record.orders)) return record.orders;
  return [record.data ?? record];
}

function extractProviderId(value: unknown): string | null {
  for (const entry of responseEntries(value)) {
    const record = objectRecord(entry);
    if (typeof record?.id === 'string' && record.id.length > 0 && record.id.length <= 128) return record.id;
  }
  return null;
}

function extractPrintUrl(value: unknown): string | null {
  const candidates: unknown[] = [];
  const visit = (entry: unknown, depth = 0) => {
    if (depth > 4) return;
    if (Array.isArray(entry)) { entry.forEach((item) => visit(item, depth + 1)); return; }
    const record = objectRecord(entry);
    if (!record) return;
    for (const [key, field] of Object.entries(record)) {
      if (typeof field === 'string' && /^(url|print_url|label_url)$/i.test(key)) candidates.push(field);
      else if (field && typeof field === 'object') visit(field, depth + 1);
    }
  };
  visit(value);
  for (const candidate of candidates) {
    try {
      const parsed = new URL(candidate as string);
      if (parsed.protocol === 'https:' && (parsed.hostname === 'melhorenvio.com.br' || parsed.hostname.endsWith('.melhorenvio.com.br'))) return parsed.toString();
    } catch { /* Ignore malformed provider values. */ }
  }
  return null;
}

function shipmentProducts(items: { productName: string; quantity: number; unitPriceCents: number }[], discountCents: number, subtotalCents: number) {
  const shares = items.map((item) => {
    const lineTotalCents = item.unitPriceCents * item.quantity;
    const exactShare = subtotalCents ? discountCents * lineTotalCents / subtotalCents : 0;
    return { item, lineTotalCents, discountCents: Math.min(lineTotalCents - 1, Math.floor(exactShare)), remainder: exactShare - Math.floor(exactShare) };
  });
  let remaining = discountCents - shares.reduce((sum, line) => sum + line.discountCents, 0);
  while (remaining > 0) {
    const candidate = shares.filter((line) => line.discountCents < line.lineTotalCents - 1).sort((a, b) => b.remainder - a.remainder)[0];
    if (!candidate) throw new BadRequestException('Não foi possível distribuir o desconto nas informações fiscais do envio.');
    candidate.discountCents++; candidate.remainder = -1; remaining--;
  }
  return shares.flatMap(({ item, lineTotalCents, discountCents: lineDiscount }) => {
    const netCents = lineTotalCents - lineDiscount;
    const baseUnitCents = Math.floor(netCents / item.quantity);
    const extraCentUnits = netCents % item.quantity;
    const products: { name: string; quantity: string; unitary_value: string }[] = [];
    if (item.quantity > extraCentUnits) products.push({ name: item.productName, quantity: String(item.quantity - extraCentUnits), unitary_value: (baseUnitCents / 100).toFixed(2) });
    if (extraCentUnits > 0) products.push({ name: item.productName, quantity: String(extraCentUnits), unitary_value: ((baseUnitCents + 1) / 100).toFixed(2) });
    return products;
  });
}

function isValidCpf(value: string) {
  if (!/^\d{11}$/.test(value) || /^(\d)\1{10}$/.test(value)) return false;
  const digits = [...value].map(Number);
  const check = (length: number) => {
    const sum = digits.slice(0, length).reduce((total, digit, index) => total + digit * (length + 1 - index), 0);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return check(9) === digits[9] && check(10) === digits[10];
}

@Injectable()
export class ShippingService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  async status() {
    const record = await this.prisma.shippingIntegration.findUnique({ where: { id: tokenId }, select: { expiresAt: true, refreshExpiresAt: true } });
    const appReady = this.integrationConfigurationReady();
    return {
      appReady,
      connected: Boolean(record && record.refreshExpiresAt > new Date()),
      expiresAt: record?.expiresAt ?? null,
      originCepConfigured: Boolean(this.config.get('MELHOR_ENVIO_FROM_CEP')),
      senderDataConfigured: this.senderConfigurationReady(),
    };
  }

  async getAuthorizationUrl() {
    this.assertOAuthConfigured();
    this.assertEncryptionKey();
    await this.prisma.shippingOAuthState.deleteMany({ where: { expiresAt: { lte: new Date() } } });
    const state = randomBytes(32).toString('base64url');
    await this.prisma.shippingOAuthState.create({ data: { id: state, expiresAt: new Date(Date.now() + 10 * 60 * 1000) } });
    const url = new URL(`${this.oauthBaseUrl()}/oauth/authorize`);
    url.searchParams.set('client_id', this.config.getOrThrow<string>('MELHOR_ENVIO_CLIENT_ID'));
    url.searchParams.set('redirect_uri', this.config.getOrThrow<string>('MELHOR_ENVIO_REDIRECT_URI'));
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('state', state);
    url.searchParams.set('scope', 'shipping-calculate cart-write shipping-checkout shipping-generate shipping-print shipping-tracking');
    return { url: url.toString() };
  }

  async completeAuthorization(code: string, state: string) {
    this.assertOAuthConfigured();
    this.assertEncryptionKey();
    if (!code || !state || code.length > 2048 || state.length > 256) throw new BadRequestException('Resposta OAuth inválida');
    const consumed = await this.prisma.shippingOAuthState.deleteMany({
      where: { id: state, expiresAt: { gt: new Date() } },
    });
    if (consumed.count !== 1) throw new BadRequestException('Autorização expirada ou inválida. Inicie a conexão novamente.');

    const result = await this.requestToken({ grant_type: 'authorization_code', code });
    await this.saveToken(result);
    return { connected: true, expiresAt: new Date(Date.now() + result.expires_in * 1000).toISOString() };
  }

  async quote(dto: ShippingQuoteDto) {
    const configuredOrigin = this.config.get<string>('MELHOR_ENVIO_FROM_CEP');
    if (!configuredOrigin) throw new ServiceUnavailableException('Configure o CEP de origem no backend antes de calcular entregas.');
    const originCep = this.normalizeCep(configuredOrigin);
    const destinationCep = this.normalizeCep(dto.cep);
    const quantities = this.normalizeItems(dto.items);
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: quantities.map((item) => item.variantId) }, active: true, product: { active: true } },
      include: { product: { select: {
        name: true, shippingWeightGrams: true, shippingWidthCm: true,
        shippingHeightCm: true, shippingLengthCm: true,
      } } },
    });
    if (variants.length !== quantities.length) throw new BadRequestException('Um ou mais itens não estão disponíveis');

    const productLines = variants.map((variant) => {
      const { shippingWeightGrams, shippingWidthCm, shippingHeightCm, shippingLengthCm } = variant.product;
      if (![shippingWeightGrams, shippingWidthCm, shippingHeightCm, shippingLengthCm].every((value) => Number.isInteger(value) && value! > 0)) {
        throw new ServiceUnavailableException(`Cadastre o peso e as dimensões de envio de ${variant.product.name} para calcular o frete.`);
      }
      const quantity = quantities.find((item) => item.variantId === variant.id)!.quantity;
      return {
        id: variant.sku,
        name: variant.product.name,
        width: shippingWidthCm,
        height: shippingHeightCm,
        length: shippingLengthCm,
        weight: Number((shippingWeightGrams! / 1000).toFixed(3)),
        insurance_value: Number((variant.priceCents / 100).toFixed(2)),
        quantity,
      };
    });

    const rawRates = await this.apiRequest<MeRate[]>('/shipment/calculate', {
      method: 'POST',
      body: JSON.stringify({
        from: { postal_code: originCep }, to: { postal_code: destinationCep },
        products: productLines, options: { receipt: false, own_hand: false },
      }),
    });
    if (!Array.isArray(rawRates)) throw new ServiceUnavailableException('O Melhor Envio retornou uma cotação inválida');

    const rates = rawRates.flatMap((rate) => {
      const priceCents = moneyToCents(rate.custom_price ?? rate.price);
      const deliveryDays = Number(rate.custom_delivery_time ?? rate.delivery_time);
      if (!Number.isSafeInteger(rate.id) || !Number.isSafeInteger(priceCents) || priceCents < 0 || !Number.isInteger(deliveryDays) || deliveryDays < 0) return [];
      return [{
        destinationCep,
        items: quantities,
        serviceId: rate.id,
        serviceName: rate.name,
        companyName: rate.company?.name ?? 'Transportadora',
        priceCents,
        deliveryDays,
        packages: rate.packages ?? [],
      }];
    });
    if (!rates.length) throw new ServiceUnavailableException('Não há opções de entrega disponíveis para este CEP.');

    const expiresAt = new Date(Date.now() + quoteTtlMs);
    const quotes = await Promise.all(rates.map((rate) => this.prisma.shippingQuote.create({ data: { ...rate, packages: rate.packages as Prisma.InputJsonValue, expiresAt } })));
    return quotes.map((quote) => ({
      id: quote.id, serviceId: quote.serviceId, serviceName: quote.serviceName,
      companyName: quote.companyName, priceCents: quote.priceCents,
      deliveryDays: quote.deliveryDays, expiresAt: quote.expiresAt.toISOString(),
    }));
  }

  async prepareOrderLabel(orderId: string, dto: CreateShippingLabelDto) {
    this.assertSenderConfiguration();
    if (!isValidCpf(dto.recipientCpf) || !/^\d{44}$/.test(dto.invoiceKey)) throw new BadRequestException('Informe um CPF válido e a chave de acesso da NF-e com 44 dígitos.');
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { customer: true, items: true, shippingQuote: true } });
    if (!order) throw new NotFoundException('Pedido não encontrado.');
    if (order.status !== 'PAID' && order.status !== 'PROCESSING') throw new BadRequestException('Só é possível preparar o envio de um pedido pago.');
    if (!order.shippingQuote) throw new BadRequestException('Este pedido não tem uma cotação do Melhor Envio associada.');
    if (/azul\s*cargo/i.test(order.shippingQuote.companyName)) throw new BadRequestException('Azul Cargo está disponível para cotação, mas não para compra de etiquetas por esta API. Finalize este envio manualmente no Melhor Envio.');
    if (/latam/i.test(order.shippingQuote.companyName) && !this.config.get<string>('MELHOR_ENVIO_SENDER_CNAE')?.trim()) throw new BadRequestException('Configure o CNAE do remetente para emitir etiqueta LATAM Cargo.');
    if (order.shippingLabelStatus || order.shippingLabelId) throw new BadRequestException('Este pedido já iniciou o fluxo de etiqueta. Confira a etapa atual no painel.');
    if (!order.customer.phone) throw new BadRequestException('Cadastre um telefone do destinatário antes de preparar o envio.');
    const address = objectRecord(order.shippingAddress);
    if (!address || typeof address.street !== 'string' || typeof address.number !== 'string' || typeof address.neighborhood !== 'string' || typeof address.city !== 'string' || typeof address.state !== 'string' || typeof address.cep !== 'string') {
      throw new BadRequestException('O endereço de entrega do pedido está incompleto.');
    }
    const phone = order.customer.phone.replace(/\D/g, '');
    if (phone.length < 10 || phone.length > 13) throw new BadRequestException('O telefone do destinatário precisa ter DDD e um número válido.');
    if (!Array.isArray(order.shippingQuote.packages) || order.shippingQuote.packages.length !== 1) {
      throw new BadRequestException('Esta cotação retornou mais de um volume ou não trouxe pacote válido. Para evitar uma etiqueta incorreta, finalize esse envio manualmente no Melhor Envio.');
    }
    const packageRecord = objectRecord(order.shippingQuote.packages[0]);
    const dimensions = objectRecord(packageRecord?.dimensions) ?? packageRecord;
    const height = Number(dimensions?.height);
    const width = Number(dimensions?.width);
    const length = Number(dimensions?.length);
    const weight = Number(packageRecord?.weight);
    if (![height, width, length, weight].every((value) => Number.isFinite(value) && value > 0)) throw new BadRequestException('O pacote salvo na cotação está incompleto. Refaça a cotação ou finalize o envio manualmente.');

    const claimed = await this.prisma.order.updateMany({
      where: { id: order.id, status: { in: ['PAID', 'PROCESSING'] }, shippingLabelId: null, shippingLabelStatus: null },
      data: { shippingLabelStatus: 'PREPARING' },
    });
    if (claimed.count !== 1) throw new BadRequestException('Outro processo já iniciou a expedição deste pedido. Atualize a lista.');

    try {
      const sender = this.senderPayload();
      const products = shipmentProducts(order.items, order.discountCents, order.subtotalCents);
      const body = {
        service: order.shippingQuote.serviceId,
        from: sender,
        to: {
          name: order.customer.name, email: order.customer.email, phone,
          document: dto.recipientCpf,
          address: address.street, complement: typeof address.complement === 'string' ? address.complement : '',
          number: address.number, district: address.neighborhood, city: address.city,
          postal_code: this.normalizeCep(address.cep), country_id: 'BR', state_abbr: address.state.toUpperCase(),
        },
        products,
        volumes: [{ height, width, length, weight }],
        options: {
          platform: 'Agape Streetwear', reminder: `Pedido #${order.number}`,
          insurance_value: (order.subtotalCents - order.discountCents) / 100, receipt: false, own_hand: false,
          invoice: { key: dto.invoiceKey },
          tags: [{ tag: `Agape #${order.number}`, url: null }],
        },
      };
      const result = await this.apiRequest<unknown>('/cart', { method: 'POST', body: JSON.stringify(body) }, 'adicionar a etiqueta ao carrinho');
      const shippingLabelId = extractProviderId(result);
      if (!shippingLabelId) throw new ServiceUnavailableException('O Melhor Envio respondeu sem o identificador da etiqueta. Confira o carrinho da conta antes de tentar novamente.');
      return await this.prisma.order.update({ where: { id: order.id }, data: { shippingLabelId, shippingLabelStatus: 'CARTED' }, select: { id: true, number: true, shippingLabelId: true, shippingLabelStatus: true } });
    } catch (error) {
      await this.prisma.order.updateMany({ where: { id: order.id, shippingLabelStatus: 'PREPARING' }, data: { shippingLabelStatus: 'CART_REVIEW' } });
      throw error;
    }
  }

  async purchaseOrderLabel(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { id: true, number: true, status: true, shippingLabelId: true, shippingLabelStatus: true } });
    if (!order) throw new NotFoundException('Pedido não encontrado.');
    if (order.status !== 'PAID' && order.status !== 'PROCESSING') throw new BadRequestException('Só é possível comprar o envio de um pedido pago.');
    if (!order.shippingLabelId || order.shippingLabelStatus !== 'CARTED') throw new BadRequestException('Prepare a etiqueta e confira o carrinho do Melhor Envio antes da compra.');
    const claimed = await this.prisma.order.updateMany({ where: { id: order.id, status: { in: ['PAID', 'PROCESSING'] }, shippingLabelStatus: 'CARTED' }, data: { shippingLabelStatus: 'PURCHASING' } });
    if (claimed.count !== 1) throw new BadRequestException('O envio está em processamento ou precisa de conferência. Atualize a lista.');
    try {
      await this.apiRequest<unknown>('/shipment/checkout', { method: 'POST', body: JSON.stringify({ orders: [order.shippingLabelId] }) }, 'comprar o envio');
      return await this.prisma.order.update({ where: { id: order.id }, data: { shippingLabelStatus: 'PURCHASED' }, select: { id: true, number: true, shippingLabelId: true, shippingLabelStatus: true } });
    } catch (error) {
      await this.prisma.order.updateMany({ where: { id: order.id, shippingLabelStatus: 'PURCHASING' }, data: { shippingLabelStatus: 'PAYMENT_REVIEW' } });
      throw error;
    }
  }

  async generateOrderLabel(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { id: true, status: true, shippingLabelId: true, shippingLabelStatus: true } });
    if (!order) throw new NotFoundException('Pedido não encontrado.');
    if (order.status !== 'PAID' && order.status !== 'PROCESSING') throw new BadRequestException('O pedido precisa estar pago e em preparação antes de gerar a etiqueta.');
    if (!order.shippingLabelId || order.shippingLabelStatus !== 'PURCHASED') throw new BadRequestException('Compre a etiqueta antes de gerar e comunicar o envio à transportadora.');
    const claimed = await this.prisma.order.updateMany({ where: { id: order.id, status: { in: ['PAID', 'PROCESSING'] }, shippingLabelStatus: 'PURCHASED' }, data: { shippingLabelStatus: 'GENERATING' } });
    if (claimed.count !== 1) throw new BadRequestException('A etiqueta está em processamento ou precisa de conferência. Atualize a lista.');
    try {
      await this.apiRequest<unknown>('/shipment/generate', { method: 'POST', body: JSON.stringify({ orders: [order.shippingLabelId] }) }, 'gerar a etiqueta');
      return await this.prisma.order.update({ where: { id: order.id }, data: { shippingLabelStatus: 'GENERATED' }, select: { id: true, shippingLabelId: true, shippingLabelStatus: true } });
    } catch (error) {
      await this.prisma.order.updateMany({ where: { id: order.id, shippingLabelStatus: 'GENERATING' }, data: { shippingLabelStatus: 'GENERATION_REVIEW' } });
      throw error;
    }
  }

  async printOrderLabel(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { id: true, shippingLabelId: true, shippingLabelStatus: true } });
    if (!order) throw new NotFoundException('Pedido não encontrado.');
    if (!order.shippingLabelId || order.shippingLabelStatus !== 'GENERATED') throw new BadRequestException('Gere a etiqueta antes de solicitar a impressão.');
    const result = await this.apiRequest<unknown>('/shipment/print', { method: 'POST', body: JSON.stringify({ orders: [order.shippingLabelId], mode: 'private' }) }, 'solicitar a impressão');
    const url = extractPrintUrl(result);
    if (!url) throw new ServiceUnavailableException('O Melhor Envio não retornou um link privado de impressão.');
    return { url };
  }

  async refreshOrderTracking(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { id: true, shippingLabelId: true, shippingLabelStatus: true } });
    if (!order) throw new NotFoundException('Pedido não encontrado.');
    if (!order.shippingLabelId || order.shippingLabelStatus !== 'GENERATED') throw new BadRequestException('Gere a etiqueta antes de consultar o rastreio.');
    const result = await this.apiRequest<unknown>('/shipment/tracking', { method: 'POST', body: JSON.stringify({ orders: [order.shippingLabelId] }) }, 'consultar o rastreio');
    const providerEntry = objectRecord(responseEntries(result)[0]);
    const tracking = providerEntry?.tracking;
    const trackingCode = typeof providerEntry?.tracking_code === 'string' ? providerEntry.tracking_code
      : typeof providerEntry?.trackingCode === 'string' ? providerEntry.trackingCode
      : typeof tracking === 'string' ? tracking
      : typeof objectRecord(tracking)?.code === 'string' ? objectRecord(tracking)!.code as string : null;
    if (trackingCode && trackingCode.length <= 80) await this.prisma.order.update({ where: { id: order.id }, data: { trackingCode } });
    return { trackingCode: trackingCode && trackingCode.length <= 80 ? trackingCode : null, status: typeof providerEntry?.status === 'string' ? providerEntry.status : null };
  }

  async getValidAccessToken() {
    this.assertOAuthConfigured();
    this.assertEncryptionKey();
    let record = await this.prisma.shippingIntegration.findUnique({ where: { id: tokenId } });
    if (!record) throw new ServiceUnavailableException('Conecte a conta do Melhor Envio no painel administrativo.');
    if (record.expiresAt.getTime() > Date.now() + 2 * 60 * 1000) return this.decrypt(record.accessTokenEncrypted);
    if (record.refreshExpiresAt.getTime() <= Date.now()) throw new ServiceUnavailableException('A autorização do Melhor Envio expirou. Reconecte a conta no painel.');

    const refreshed = await this.requestToken({ grant_type: 'refresh_token', refresh_token: this.decrypt(record.refreshTokenEncrypted) });
    record = await this.saveToken(refreshed);
    return this.decrypt(record.accessTokenEncrypted);
  }

  normalizeItems(items: { variantId: string; quantity: number }[]) {
    const aggregated = new Map<string, number>();
    for (const item of items) {
      if (!item.variantId || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20) throw new BadRequestException('Quantidade inválida');
      const quantity = (aggregated.get(item.variantId) ?? 0) + item.quantity;
      if (quantity > 20) throw new BadRequestException('O limite por variação é 20 unidades.');
      aggregated.set(item.variantId, quantity);
    }
    return [...aggregated].map(([variantId, quantity]) => ({ variantId, quantity })).sort((a, b) => a.variantId.localeCompare(b.variantId));
  }

  private async apiRequest<T>(path: string, init: RequestInit, operation = 'consultar o Melhor Envio'): Promise<T> {
    const url = `${this.apiBaseUrl()}/${path.replace(/^\//, '')}`;
    const perform = async (token: string) => fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': this.config.getOrThrow<string>('MELHOR_ENVIO_USER_AGENT'),
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...init.headers,
      },
      signal: AbortSignal.timeout(12000),
    });
    let response = await perform(await this.getValidAccessToken());
    if (response.status === 401) response = await perform(await this.forceRefresh());
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = typeof data?.message === 'string' ? data.message : '';
      throw new ServiceUnavailableException(detail ? `Falha ao ${operation}: ${detail}` : `Não foi possível ${operation} no Melhor Envio.`);
    }
    return data as T;
  }

  private async forceRefresh() {
    const record = await this.prisma.shippingIntegration.findUnique({ where: { id: tokenId } });
    if (!record || record.refreshExpiresAt <= new Date()) throw new ServiceUnavailableException('Reconecte a conta do Melhor Envio.');
    const refreshed = await this.requestToken({ grant_type: 'refresh_token', refresh_token: this.decrypt(record.refreshTokenEncrypted) });
    const saved = await this.saveToken(refreshed);
    return this.decrypt(saved.accessTokenEncrypted);
  }

  private async requestToken(fields: { grant_type: 'authorization_code'; code: string } | { grant_type: 'refresh_token'; refresh_token: string }): Promise<MeTokenResponse> {
    const form = new URLSearchParams({
      grant_type: fields.grant_type,
      client_id: this.config.getOrThrow<string>('MELHOR_ENVIO_CLIENT_ID'),
      client_secret: this.config.getOrThrow<string>('MELHOR_ENVIO_CLIENT_SECRET'),
      redirect_uri: this.config.getOrThrow<string>('MELHOR_ENVIO_REDIRECT_URI'),
      ...(fields.grant_type === 'authorization_code' ? { code: fields.code } : { refresh_token: fields.refresh_token }),
    });
    const response = await fetch(`${this.oauthBaseUrl()}/oauth/token`, {
      method: 'POST', body: form,
      headers: { Accept: 'application/json', 'User-Agent': this.config.getOrThrow<string>('MELHOR_ENVIO_USER_AGENT') },
      signal: AbortSignal.timeout(12000),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || typeof data?.access_token !== 'string' || typeof data?.refresh_token !== 'string' || !Number.isFinite(data?.expires_in)) {
      throw new ServiceUnavailableException('Não foi possível autorizar a conta do Melhor Envio. Confira o app e a URL de retorno.');
    }
    return data as MeTokenResponse;
  }

  private saveToken(token: MeTokenResponse) {
    const now = Date.now();
    return this.prisma.shippingIntegration.upsert({
      where: { id: tokenId },
      create: {
        id: tokenId, accessTokenEncrypted: this.encrypt(token.access_token),
        refreshTokenEncrypted: this.encrypt(token.refresh_token),
        expiresAt: new Date(now + token.expires_in * 1000),
        refreshExpiresAt: new Date(now + 45 * 24 * 60 * 60 * 1000),
      },
      update: {
        accessTokenEncrypted: this.encrypt(token.access_token),
        refreshTokenEncrypted: this.encrypt(token.refresh_token),
        expiresAt: new Date(now + token.expires_in * 1000),
        refreshExpiresAt: new Date(now + 45 * 24 * 60 * 60 * 1000),
      },
    });
  }

  private encrypt(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
  }

  private decrypt(value: string) {
    const [iv, tag, ciphertext] = value.split('.').map((part) => Buffer.from(part, 'base64url'));
    if (!iv || !tag || !ciphertext) throw new ServiceUnavailableException('Token do Melhor Envio inválido. Reconecte a integração.');
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey(), iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    } catch {
      throw new ServiceUnavailableException('Não foi possível descriptografar o token do Melhor Envio. Revise INTEGRATION_TOKEN_KEY.');
    }
  }

  private encryptionKey() {
    const encoded = this.config.getOrThrow<string>('INTEGRATION_TOKEN_KEY');
    const key = Buffer.from(encoded, 'base64');
    if (key.length !== 32) throw new ServiceUnavailableException('INTEGRATION_TOKEN_KEY precisa ser base64 com 32 bytes.');
    return key;
  }

  private senderConfigurationReady() {
    const required = ['MELHOR_ENVIO_SENDER_NAME', 'MELHOR_ENVIO_SENDER_EMAIL', 'MELHOR_ENVIO_SENDER_PHONE', 'MELHOR_ENVIO_SENDER_CNPJ', 'MELHOR_ENVIO_SENDER_ADDRESS', 'MELHOR_ENVIO_SENDER_NUMBER', 'MELHOR_ENVIO_SENDER_DISTRICT', 'MELHOR_ENVIO_SENDER_CITY', 'MELHOR_ENVIO_SENDER_STATE'];
    if (required.some((key) => !this.config.get<string>(key)?.trim())) return false;
    const cnpj = (this.config.get<string>('MELHOR_ENVIO_SENDER_CNPJ') ?? '').replace(/\D/g, '');
    const phone = (this.config.get<string>('MELHOR_ENVIO_SENDER_PHONE') ?? '').replace(/\D/g, '');
    const cep = (this.config.get<string>('MELHOR_ENVIO_FROM_CEP') ?? '').replace(/\D/g, '');
    const state = this.config.get<string>('MELHOR_ENVIO_SENDER_STATE') ?? '';
    const email = this.config.get<string>('MELHOR_ENVIO_SENDER_EMAIL') ?? '';
    return /^\d{14}$/.test(cnpj) && /^\d{10,13}$/.test(phone) && /^\d{8}$/.test(cep) && /^[A-Z]{2}$/i.test(state) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
  private assertSenderConfiguration() {
    if (!this.senderConfigurationReady()) throw new ServiceUnavailableException('Configure os dados fiscais e o endereço do remetente no backend antes de emitir etiquetas.');
  }
  private senderPayload() {
    const required = (key: string) => this.config.getOrThrow<string>(key).trim();
    const optional = (key: string) => (this.config.get<string>(key) ?? '').trim();
    return {
      name: required('MELHOR_ENVIO_SENDER_NAME'),
      email: required('MELHOR_ENVIO_SENDER_EMAIL'),
      phone: required('MELHOR_ENVIO_SENDER_PHONE').replace(/\D/g, ''),
      company_document: required('MELHOR_ENVIO_SENDER_CNPJ').replace(/\D/g, ''),
      state_register: optional('MELHOR_ENVIO_SENDER_STATE_REGISTER') || 'ISENTO',
      ...(optional('MELHOR_ENVIO_SENDER_CNAE') ? { economic_activity_code: optional('MELHOR_ENVIO_SENDER_CNAE') } : {}),
      address: required('MELHOR_ENVIO_SENDER_ADDRESS'),
      complement: optional('MELHOR_ENVIO_SENDER_COMPLEMENT'),
      number: required('MELHOR_ENVIO_SENDER_NUMBER'),
      district: required('MELHOR_ENVIO_SENDER_DISTRICT'),
      city: required('MELHOR_ENVIO_SENDER_CITY'),
      postal_code: this.normalizeCep(required('MELHOR_ENVIO_FROM_CEP')),
      state_abbr: required('MELHOR_ENVIO_SENDER_STATE').toUpperCase(),
    };
  }
  private assertEncryptionKey() { this.encryptionKey(); }
  private assertOAuthConfigured() {
    if (!this.config.get('MELHOR_ENVIO_CLIENT_ID') || !this.config.get('MELHOR_ENVIO_CLIENT_SECRET') || !this.config.get('MELHOR_ENVIO_REDIRECT_URI')) throw new ServiceUnavailableException('Configure as credenciais OAuth do Melhor Envio no backend.');
    const userAgent = this.config.get<string>('MELHOR_ENVIO_USER_AGENT') ?? '';
    if (!/^.+\([^()\s@]+@[^()\s@]+\.[^()\s@]+\)$/.test(userAgent) || /preencher|seu-email|example\.com/i.test(userAgent)) throw new ServiceUnavailableException('Configure MELHOR_ENVIO_USER_AGENT com o nome da loja e um e-mail de atendimento válido.');
  }
  private integrationConfigurationReady() {
    const clientConfigured = Boolean(this.config.get<string>('MELHOR_ENVIO_CLIENT_ID')?.trim() && this.config.get<string>('MELHOR_ENVIO_CLIENT_SECRET')?.trim() && this.config.get<string>('MELHOR_ENVIO_REDIRECT_URI')?.trim());
    const userAgent = this.config.get<string>('MELHOR_ENVIO_USER_AGENT') ?? '';
    const userAgentConfigured = /^.+\([^()\s@]+@[^()\s@]+\.[^()\s@]+\)$/.test(userAgent) && !/preencher|seu-email|example\.com/i.test(userAgent);
    const originConfigured = /^\d{8}$/.test((this.config.get<string>('MELHOR_ENVIO_FROM_CEP') ?? '').replace(/\D/g, ''));
    const key = Buffer.from(this.config.get<string>('INTEGRATION_TOKEN_KEY') ?? '', 'base64');
    return clientConfigured && userAgentConfigured && originConfigured && key.length === 32;
  }
  private normalizeCep(cep: string) {
    const normalized = cep.replace(/\D/g, '');
    if (!/^\d{8}$/.test(normalized)) throw new BadRequestException('Informe um CEP válido com 8 dígitos.');
    return normalized;
  }
  private baseUrl() {
    return this.config.get<string>('MELHOR_ENVIO_ENV') === 'production'
      ? 'https://melhorenvio.com.br'
      : 'https://sandbox.melhorenvio.com.br';
  }
  private apiBaseUrl() { return `${this.baseUrl()}/api/v2/me`; }
  private oauthBaseUrl() { return this.baseUrl(); }
}
