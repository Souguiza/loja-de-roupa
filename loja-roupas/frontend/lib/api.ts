import type { Product } from './types';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

export type CheckoutPayload = {
  name: string; email: string; phone?: string; whatsappUpdates?: boolean; shippingQuoteId: string; couponCode?: string;
  items: { variantId: string; quantity: number }[];
  address: { cep: string; street: string; number: string; complement?: string; neighborhood: string; city: string; state: string };
};

export async function validateCoupon(payload: { code: string; items: { variantId: string; quantity: number }[] }) {
  const res = await fetch(`${API}/coupons/validate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(Array.isArray(data?.message) ? data.message.join(', ') : data?.message ?? 'Cupom inválido');
  return data as { code: string; subtotalCents: number; discountCents: number; totalCents: number };
}

export async function createOrder(payload: CheckoutPayload) {
  const res = await fetch(`${API}/orders`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(Array.isArray(data?.message) ? data.message.join(', ') : data?.message ?? 'Não foi possível criar o pedido');
  return data as { number: number; checkoutUrl: string; publicToken: string };
}

export async function quoteShipping(payload: { cep: string; items: { variantId: string; quantity: number }[] }) {
  const res = await fetch(`${API}/shipping/quote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(Array.isArray(data?.message) ? data.message.join(', ') : data?.message ?? 'Não foi possível calcular o frete');
  return data as { id: string; serviceName: string; companyName: string; priceCents: number; deliveryDays: number; expiresAt: string }[];
}

// Retorna null se a API estiver fora do ar (a vitrine usa a coleção de demonstração).
export async function getProducts(): Promise<Product[] | null> {
  try {
    const res = await fetch(`${API}/products`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as Product[];
  } catch {
    return null;
  }
}

export async function getProduct(slug: string): Promise<Product | null> {
  try {
    const res = await fetch(`${API}/products/${encodeURIComponent(slug)}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as Product;
  } catch {
    return null;
  }
}
