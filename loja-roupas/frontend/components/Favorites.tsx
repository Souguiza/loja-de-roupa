'use client';

import Link from 'next/link';
import { useCart } from '@/lib/cart';
import { brl } from '@/lib/format';
import type { Product } from '@/lib/types';
import { Garment } from './Garment';

export function Favorites({ products }: { products: Product[] }) {
  const { favorites, toggleFavorite } = useCart();
  const saved = products.filter((product) => favorites.includes(product.id));
  return saved.length ? <div className="favorites-grid" aria-live="polite">{saved.map((product) => {
    const available = product.variants.some((variant) => variant.stockQty > 0);
    const price = Math.min(...product.variants.map((variant) => variant.priceCents), Number.POSITIVE_INFINITY);
    return <article className="favorite-card" key={product.id}>
      <Link className="favorite-visual" href={`/produto/${product.slug}`}><Garment shape={product.shape} fill={product.variants[0]?.colorHex ?? '#eceae6'} hasPrint={product.hasPrint} /><span>{available ? 'NO DROP' : 'ESGOTADO'}</span></Link>
      <div className="favorite-copy"><p>{product.category.name}</p><h2><Link href={`/produto/${product.slug}`}>{product.name}</Link></h2><strong>{Number.isFinite(price) ? brl(price) : '—'}</strong>
        <button type="button" onClick={() => toggleFavorite(product.id)} aria-label={`Remover ${product.name} dos salvos`}>REMOVER ×</button>
      </div>
    </article>;
  })}</div> : <section className="favorites-empty"><span aria-hidden="true">♡</span><h2>NENHUMA PEÇA SALVA AINDA</h2><p>Guarde as que chamarem sua atenção e encontre tudo por aqui.</p><Link href="/#drop">EXPLORAR O DROP ↗</Link></section>;
}
