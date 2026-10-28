import { Rack } from '@/components/Rack';
import { getProducts } from '@/lib/api';
import { FALLBACK } from '@/lib/fallback';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const fromApi = await getProducts();
  const demoCatalog = fromApi === null && process.env.NODE_ENV !== 'production';
  return <Rack
    products={fromApi ?? (demoCatalog ? FALLBACK : [])}
    demo={demoCatalog}
    catalogUnavailable={fromApi === null && !demoCatalog}
  />;
}
