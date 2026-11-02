import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProductPurchase } from '@/components/ProductPurchase';
import { getProduct } from '@/lib/api';
import { BRAND } from '@/lib/brand';
import { FALLBACK } from '@/lib/fallback';

type Props = { params: Promise<{ slug: string }> };

async function loadProduct(slug: string) {
  const result = await getProduct(slug);
  if (result) return { product: result, demo: false };
  if (process.env.NODE_ENV === 'production') return null;
  const fallback = FALLBACK.find((product) => product.slug === slug);
  return fallback ? { product: fallback, demo: true } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadProduct(slug);
  if (!data) return { title: 'Peça não encontrada' };
  const { product, demo } = data;
  return {
    title: product.name,
    description: product.description ?? `${product.name} — ${product.category.name}. Streetwear Agape, de Mato Grosso do Sul.`,
    alternates: { canonical: `/produto/${product.slug}` },
    robots: demo ? { index: false, follow: false } : undefined,
    openGraph: {
      type: 'website',
      title: `${product.name} | ${BRAND.name}`,
      description: product.description ?? BRAND.description,
      images: product.images[0] ? [product.images[0].url] : undefined,
    },
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const data = await loadProduct(slug);
  if (!data) notFound();
  const { product, demo } = data;
  const availablePrices = product.variants.filter((variant) => variant.stockQty > 0).map((variant) => variant.priceCents).filter(Number.isSafeInteger);
  const prices = availablePrices.length > 0
    ? availablePrices
    : product.variants.map((variant) => variant.priceCents).filter(Number.isSafeInteger);
  const lowPriceCents = prices.length ? Math.min(...prices) : null;
  const offers = {
    '@type': 'AggregateOffer',
    priceCurrency: 'BRL',
    lowPrice: lowPriceCents !== null ? (lowPriceCents / 100).toFixed(2) : undefined,
    highPrice: prices.length ? (Math.max(...prices) / 100).toFixed(2) : undefined,
    offerCount: prices.length,
    availability: product.variants.some((variant) => variant.stockQty > 0)
      ? 'https://schema.org/InStock'
      : 'https://schema.org/OutOfStock',
  };
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description ?? `${product.name}, da coleção ${product.category.name} da Agape.`,
    sku: product.variants[0]?.sku,
    image: product.images.map((image) => image.url),
    brand: { '@type': 'Brand', name: BRAND.name },
    offers,
    ...(product.ratingCount ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: product.ratingAverage?.toFixed(1), reviewCount: product.ratingCount } } : {}),
  };

  return <main className="pdp-page">
    <nav className="breadcrumbs" aria-label="Caminho de navegação">
      <Link href="/">INÍCIO</Link><span aria-hidden="true">/</span><Link href="/#drop">DROP 001</Link><span aria-hidden="true">/</span><span aria-current="page">{product.name}</span>
    </nav>
    {demo && <p className="demo-pdp-banner">VISUALIZAÇÃO DE DEMONSTRAÇÃO · ESTOQUE E PREÇOS ILUSTRATIVOS</p>}
    <ProductPurchase product={product} demo={demo} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
  </main>;
}
