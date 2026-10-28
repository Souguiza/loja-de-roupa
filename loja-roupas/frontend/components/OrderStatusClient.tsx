'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { trackStoreEvent } from '@/lib/analytics-config';

type Props = { number: number; status: string; totalCents: number; items: { variantId: string; productName: string; quantity: number; unitPriceCents: number }[] };

export function OrderStatusClient({ number, status, totalCents, items }: Props) {
  const router = useRouter();

  useEffect(() => {
    if (status !== 'AWAITING_PAYMENT') return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts++;
      router.refresh();
      if (attempts >= 15) window.clearInterval(timer);
    }, 4_000);
    return () => window.clearInterval(timer);
  }, [router, status]);

  useEffect(() => {
    if (status !== 'PAID') return;
    const key = `agape:purchase-event:${number}`;
    const send = () => {
      try { if (localStorage.getItem(key)) return; } catch { return; }
      const fired = trackStoreEvent('purchase', {
        currency: 'BRL', value: totalCents / 100, transaction_id: String(number),
        items: items.map((item) => ({ item_id: item.variantId, item_name: item.productName, quantity: item.quantity, price: item.unitPriceCents / 100 })),
      });
      if (fired) { try { localStorage.setItem(key, 'sent'); } catch { /* analytics continua sem deduplicação local */ } }
    };
    send();
    const retry = window.setTimeout(send, 1_500);
    window.addEventListener('agape:analytics-consent-changed', send);
    return () => { window.clearTimeout(retry); window.removeEventListener('agape:analytics-consent-changed', send); };
  }, [items, number, status, totalCents]);

  return null;
}
