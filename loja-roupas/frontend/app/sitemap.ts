import type { MetadataRoute } from 'next';
import { getProducts } from '@/lib/api';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const products = await getProducts();
  return [
    { url: base, changeFrequency: 'daily', priority: 1 },
    ...(products ?? []).map((product) => ({
      url: `${base}/produto/${product.slug}`,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
  ];
}
