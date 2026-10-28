'use client';
import { ReactNode } from 'react';
import { Shell } from './Shell';
import { CartProvider } from '@/lib/cart';
import { AnalyticsConsent } from './AnalyticsConsent';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <CartProvider>
      <Shell>{children}</Shell>
      <AnalyticsConsent />
    </CartProvider>
  );
}
