const gaCandidate = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? '';
const pixelCandidate = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? '';

export const GA_MEASUREMENT_ID = /^G-[A-Z0-9]+$/i.test(gaCandidate) ? gaCandidate : '';
export const META_PIXEL_ID = /^\d{5,20}$/.test(pixelCandidate) ? pixelCandidate : '';
export const ANALYTICS_CONFIGURED = Boolean(GA_MEASUREMENT_ID || META_PIXEL_ID);

export type StoreEvent = 'view_item' | 'add_to_cart' | 'begin_checkout' | 'purchase';
export type StoreEventParams = { currency?: 'BRL'; value?: number; transaction_id?: string; items?: { item_id: string; item_name: string; quantity: number; price?: number }[] };

export function trackStoreEvent(event: StoreEvent, params: StoreEventParams) {
  if (typeof window === 'undefined') return false;
  try { if (window.localStorage.getItem('agape:analytics-consent:v1') !== 'accepted') return false; }
  catch { return false; }
  const fired = Boolean(window.gtag || window.fbq);
  window.gtag?.('event', event, params);
  if (window.fbq) {
    const metaEvent = event === 'view_item' ? 'ViewContent' : event === 'add_to_cart' ? 'AddToCart' : event === 'begin_checkout' ? 'InitiateCheckout' : 'Purchase';
    window.fbq('track', metaEvent, {
      currency: params.currency ?? 'BRL', value: params.value,
      content_type: 'product',
      content_ids: params.items?.map((item) => item.item_id),
      contents: params.items?.map((item) => ({ id: item.item_id, quantity: item.quantity, item_price: item.price })),
      ...(params.transaction_id ? { order_id: params.transaction_id } : {}),
    });
  }
  return fired;
}
