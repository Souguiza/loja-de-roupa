import type { Metadata } from 'next';
import { getProducts } from '@/lib/api';
import { FALLBACK } from '@/lib/fallback';
import { Favorites } from '@/components/Favorites';

export const metadata: Metadata = { title: 'Peças salvas', robots: { index: false, follow: false } };

export default async function FavoritesPage() {
  const products = await getProducts() ?? FALLBACK;
  return <main className="favorites-page"><p className="eyebrow">AGAPE / SUA LISTA</p><h1>PEÇAS QUE<br /><em>TE CHAMARAM.</em></h1><p className="favorites-intro">Seus salvos ficam neste aparelho. Entre sem cadastro e volte quando quiser.</p><Favorites products={products} /></main>;
}
