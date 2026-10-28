import './globals.css';
import type { Metadata, Viewport } from 'next';
import { ReactNode } from 'react';
import { Providers } from '@/components/Providers';
import { BRAND } from '@/lib/brand';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: { default: `${BRAND.name} — Streetwear de MS`, template: `%s | ${BRAND.name}` },
  description: BRAND.description,
  applicationName: BRAND.name,
  ...(process.env.GOOGLE_SITE_VERIFICATION?.trim()
    ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION.trim() } }
    : {}),
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: BRAND.name,
    title: `${BRAND.name} — Streetwear de MS`,
    description: BRAND.description,
  },
  twitter: { card: 'summary_large_image', title: `${BRAND.name} — Streetwear de MS`, description: BRAND.description },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
          <defs>
            <linearGradient id="fab" x1="0" x2="1">
              <stop offset="0" stopColor="#000" stopOpacity=".16" />
              <stop offset=".45" stopColor="#fff" stopOpacity=".08" />
              <stop offset="1" stopColor="#000" stopOpacity=".2" />
            </linearGradient>
          </defs>
        </svg>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
