'use client';

import { CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Garment } from './Garment';
import { useCart } from '@/lib/cart';
import { brl, sizeRank } from '@/lib/format';
import { lowestAvailablePrice } from '@/lib/product-pricing.mjs';
import { BRAND } from '@/lib/brand';
import { trackStoreEvent } from '@/lib/analytics-config';
import type { Product, Variant } from '@/lib/types';

type Sort = 'featured' | 'price-asc' | 'price-desc';
const checkoutEnabled = process.env.NEXT_PUBLIC_CHECKOUT_ENABLED === 'true';

const startingPrice = (product: Product) => lowestAvailablePrice(product.variants);

export function Rack({ products, demo, catalogUnavailable = false }: { products: Product[]; demo: boolean; catalogUnavailable?: boolean }) {
  const { add, favorites, toggleFavorite } = useCart();
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('featured');
  const [sizeFilter, setSizeFilter] = useState('all');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [color, setColor] = useState('');
  const [size, setSize] = useState('');
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const categories = useMemo(() => {
    const names = new Map<string, string>();
    products.forEach((product) => names.set(product.category.slug, product.category.name));
    return [...names];
  }, [products]);

  const availableSizes = useMemo(() => [...new Set(products.flatMap((product) => product.variants.filter((variant) => variant.stockQty > 0).map((variant) => variant.size)))].sort((a, b) => sizeRank(a) - sizeRank(b) || a.localeCompare(b)), [products]);

  const visibleProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR');
    const result = products.filter((product) => {
      const matchesCategory = category === 'all' || product.category.slug === category;
      const matchesQuery = !normalizedQuery ||
        `${product.name} ${product.description ?? ''} ${product.category.name}`.toLocaleLowerCase('pt-BR').includes(normalizedQuery);
      const matchesSize = sizeFilter === 'all' || product.variants.some((variant) => variant.size === sizeFilter && variant.stockQty > 0);
      return matchesCategory && matchesQuery && matchesSize;
    });
    if (sort !== 'featured') result.sort((a, b) => {
      const aPrice = startingPrice(a);
      const bPrice = startingPrice(b);
      if (aPrice === null) return bPrice === null ? a.name.localeCompare(b.name) : 1;
      if (bPrice === null) return -1;
      return sort === 'price-asc' ? aPrice - bPrice : bPrice - aPrice;
    });
    return result;
  }, [products, category, query, sort, sizeFilter]);

  const colors = useMemo(() => {
    const found = new Map<string, string>();
    selectedProduct?.variants.forEach((variant) => found.set(variant.color, variant.colorHex));
    return [...found];
  }, [selectedProduct]);

  useEffect(() => {
    if (!selectedProduct) return;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const dialog = document.querySelector<HTMLElement>('.product-dialog');
    const controls = () => [...(dialog?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])') ?? [])];
    controls()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setSelectedProduct(null); return; }
      if (event.key !== 'Tab') return;
      const focusable = controls();
      if (!focusable.length) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0].focus(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      returnFocusRef.current?.focus();
    };
  }, [selectedProduct]);

  const selectedVariant = selectedProduct?.variants.find((variant) => variant.color === color && variant.size === size);
  const variantsForColor = (selectedProduct?.variants ?? [])
    .filter((variant) => variant.color === color)
    .sort((a, b) => sizeRank(a.size) - sizeRank(b.size));
  const selectedColorStartingPrice = lowestAvailablePrice(variantsForColor);

  const openProduct = (product: Product) => {
    const priceCents = startingPrice(product);
    trackStoreEvent('view_item', { currency: 'BRL', value: priceCents === null ? undefined : priceCents / 100, items: [{ item_id: product.id, item_name: product.name, quantity: 1, price: priceCents === null ? undefined : priceCents / 100 }] });
    returnFocusRef.current = document.activeElement as HTMLElement;
    setSelectedProduct(product);
    setColor(product.variants.find((variant) => variant.stockQty > 0)?.color ?? product.variants[0]?.color ?? '');
    setSize('');
  };

  const addToBag = () => {
    if (!selectedProduct || !selectedVariant || selectedVariant.stockQty <= 0) return;
    add({
      variantId: selectedVariant.id,
      name: selectedProduct.name,
      size: selectedVariant.size,
      color: selectedVariant.color,
      colorHex: selectedVariant.colorHex,
      shape: selectedProduct.shape,
      hasPrint: selectedProduct.hasPrint,
      priceCents: selectedVariant.priceCents,
      maxQty: selectedVariant.stockQty,
    });
    if (!demo) trackStoreEvent('add_to_cart', { currency: 'BRL', value: selectedVariant.priceCents / 100, items: [{ item_id: selectedVariant.id, item_name: selectedProduct.name, quantity: 1, price: selectedVariant.priceCents / 100 }] });
    setSelectedProduct(null);
  };

  const clearFilters = () => {
    setQuery('');
    setCategory('all');
    setSort('featured');
    setSizeFilter('all');
  };

  return (
    <main className="storefront">
      {demo && <div className="demo-note"><span aria-hidden="true">●</span> CATÁLOGO DE DEMONSTRAÇÃO <span>—</span> os produtos e preços são exemplos</div>}

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow"><span className="eyebrow-mark" /> AGAPE STREETWEAR <span className="hero-location">· MATO GROSSO DO SUL</span></p>
          <h1 id="hero-title">A PALAVRA<br /><em>VESTE A RUA.</em></h1>
          <p className="hero-description">Streetwear com fé no peito, identidade própria e propósito em cada passo.</p>
          <a className="hero-cta" href="#drop">ENCONTRE SUA PEÇA <span aria-hidden="true">↘</span></a>
          <div className="hero-bottomline">
            <p className="hero-note">DOURADOS <span>·</span> MARACAJU — MS</p>
            <a className="hero-scroll" href="#drop"><span /> DESÇA PRO DROP</a>
          </div>
        </div>
        <div className="hero-photo" aria-label="Campanha editorial da Agape">
          <Image
            className="hero-photo-image"
            src="/agape-editorial.webp"
            alt="Dois jovens adultos em looks streetwear, em uma campanha editorial urbana."
            fill
            priority
            fetchPriority="high"
            sizes="(max-width: 760px) 100vw, 58vw"
          />
          <span className="hero-photo-index">AGAPE <b>·</b> DROP 001</span>
          <span className="hero-photo-caption">IMAGEM CONCEITUAL · NÃO É PRODUTO À VENDA</span>
        </div>
      </section>

      <section id="drop" className="collection" aria-labelledby="drop-title">
        <div className="collection-heading">
          <div>
            <p className="eyebrow">PEQUENO LOTE. GRANDE PRESENÇA.</p>
            <h2 id="drop-title">DROP <span>001</span></h2>
          </div>
          <p className="collection-aside">Escolha sua peça.<br />O resto é com você.</p>
        </div>

        <div className="catalog-tools">
          <label className="search-field" id="busca">
            <span className="sr-only">Buscar produtos</span>
            <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></svg>
            <input type="search" placeholder="BUSQUE SUA PEÇA" value={query} onChange={(event) => setQuery(event.target.value)} />
            {query && <button type="button" onClick={() => setQuery('')} aria-label="Limpar busca">×</button>}
          </label>
          <div className="catalog-sort">
            <label htmlFor="filter-size">TAMANHO</label>
            <select id="filter-size" value={sizeFilter} onChange={(event) => setSizeFilter(event.target.value)}>
              <option value="all">Todos</option>
              {availableSizes.map((availableSize) => <option key={availableSize} value={availableSize}>{availableSize}</option>)}
            </select>
          </div>
          <div className="catalog-sort">
            <label htmlFor="sort-products">ORDENAR</label>
            <select id="sort-products" value={sort} onChange={(event) => setSort(event.target.value as Sort)}>
              <option value="featured">Em destaque</option>
              <option value="price-asc">Menor preço</option>
              <option value="price-desc">Maior preço</option>
            </select>
          </div>
        </div>

        <div className="category-list" role="group" aria-label="Filtrar por categoria">
          <button type="button" aria-pressed={category === 'all'} onClick={() => setCategory('all')}>TUDO <span>{products.length.toString().padStart(2, '0')}</span></button>
          {categories.map(([slug, name]) => <button type="button" key={slug} aria-pressed={category === slug} onClick={() => setCategory(slug)}>{name}</button>)}
          <span className="result-count" aria-live="polite">{visibleProducts.length} {visibleProducts.length === 1 ? 'PEÇA' : 'PEÇAS'}</span>
        </div>

        {visibleProducts.length > 0 ? <div className="product-grid">
            {visibleProducts.map((product, index) => {
            const price = startingPrice(product);
            const available = product.variants.some((variant) => variant.stockQty > 0);
            return <article className="product-card" key={product.id} style={{ '--card-index': index } as CSSProperties}>
              <button type="button" className="favorite-toggle" aria-pressed={favorites.includes(product.id)} aria-label={favorites.includes(product.id) ? `Remover ${product.name} dos salvos` : `Salvar ${product.name}`} onClick={() => toggleFavorite(product.id)}>{favorites.includes(product.id) ? '♥' : '♡'}</button>
              <button type="button" className="product-visual" onClick={() => openProduct(product)} aria-label={`Ver detalhes de ${product.name}`}>
                <span className="product-index">AGAPE / {String(index + 1).padStart(2, '0')}</span>
                <span className="product-badge">{available ? 'DROP 001' : 'ESGOTADO'}</span>
                <Garment shape={product.shape} fill={product.variants.find((variant) => variant.stockQty > 0)?.colorHex ?? product.variants[0]?.colorHex ?? '#eceae6'} hasPrint={product.hasPrint} />
                <span className="quick-view">VER PEÇA <b aria-hidden="true">↗</b></span>
              </button>
              <div className="product-meta">
                <div><p className="product-category">{product.category.name} <span>·</span> {new Set(product.variants.map((variant) => variant.color)).size} CORES</p>
                  <h3><button type="button" onClick={() => openProduct(product)}>{product.name}</button></h3></div>
                <p className="product-price">{price !== null ? `A PARTIR DE ${brl(price)}` : 'ESGOTADO'}</p>
              </div>
              <p className="product-installments">{available ? 'PREÇO POR VARIAÇÃO · ESTOQUE DO DROP' : 'SEM ESTOQUE DISPONÍVEL'}</p>
            </article>;
          })}
        </div> : <div className="no-results" role={catalogUnavailable ? 'alert' : 'status'}>
          {catalogUnavailable ? <>
            <span aria-hidden="true">!</span><h3>VITRINE TEMPORARIAMENTE INDISPONÍVEL</h3>
            <p>Não conseguimos carregar o catálogo agora. Confira as novidades no Instagram.</p>
            <a className="no-results-link" href={BRAND.instagramUrl} target="_blank" rel="noreferrer">ACOMPANHE A AGAPE ↗</a>
          </> : products.length === 0 ? <>
            <span aria-hidden="true">✳</span><h3>NOVAS PEÇAS EM BREVE</h3>
            <p>Estamos preparando o próximo drop da Agape.</p>
            <a className="no-results-link" href={BRAND.instagramUrl} target="_blank" rel="noreferrer">ACOMPANHE A AGAPE ↗</a>
          </> : <>
            <span aria-hidden="true">:(</span><h3>NÃO ACHOU SUA PEÇA?</h3><p>Tente outra busca ou veja o drop inteiro.</p>
            <button type="button" onClick={clearFilters}>LIMPAR FILTROS</button>
          </>}
        </div>}
      </section>

      <section id="lookbook" className="campaign-band" aria-labelledby="campaign-title">
        <div className="campaign-copy">
          <p className="eyebrow"><span className="eyebrow-mark" /> NOSSO JEITO DE VESTIR</p>
          <h2 id="campaign-title">FÉ NO PEITO.<br /><em>RUA NO PASSO.</em></h2>
          <p>Streetwear com fé e identidade própria — para expressar o que você acredita na roupa, na atitude e no caminho.</p>
          <a href={BRAND.instagramUrl} target="_blank" rel="noreferrer">CONHEÇA A AGAPE NO INSTAGRAM <span aria-hidden="true">↗</span></a>
          <small>{BRAND.instagramHandle} · DOURADOS / MARACAJU — MS</small>
        </div>
        <div className="campaign-mark" aria-hidden="true"><span>A</span><b>AMOR<br />EM MOVIMENTO</b></div>
      </section>

      <section className="manifesto" aria-labelledby="manifesto-title">
        <div className="manifesto-number">067</div>
        <p className="eyebrow">DOURADOS / MARACAJU — MS</p>
        <h2 id="manifesto-title">ESPALHANDO A PALAVRA<br /><em>ATRAVÉS DA MODA.</em></h2>
        <p>Peças exclusivas com estilo e propósito. Streetwear cristão feito para quem carrega sua fé e identidade no próprio caminho.</p>
        <span className="manifesto-signature">{BRAND.signature}</span>
      </section>

      <footer className="store-footer">
        <a className="footer-logo" href="#top" onClick={(event) => { event.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><i aria-hidden="true"><Image src="/agape-logo.png" alt="" width={38} height={38} /></i>Agape<span>MS</span></a>
        <p>STREETWEAR DE DOURADOS / MARACAJU — MS.</p>
        <a className="footer-social" href={BRAND.instagramUrl} target="_blank" rel="noreferrer">INSTAGRAM {BRAND.instagramHandle} ↗</a>
        <a className="footer-social" href="/privacidade">PRIVACIDADE</a>
        <a className="footer-admin-link" href="/admin">ACESSO DO LOJISTA</a>
        <span>© {new Date().getFullYear()} AGAPE. FEITA PRA RODAR.</span>
      </footer>

      {selectedProduct && <div className="product-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedProduct(null); }}>
        <section className="product-dialog" role="dialog" aria-modal="true" aria-labelledby="product-dialog-title">
          <button className="dialog-close" type="button" onClick={() => setSelectedProduct(null)} aria-label="Fechar detalhes">FECHAR <span aria-hidden="true">×</span></button>
          <div className="dialog-visual"><span className="dialog-code">AGAPE / DROP 001</span><Garment shape={selectedProduct.shape} fill={colors.find(([name]) => name === color)?.[1] ?? '#eceae6'} hasPrint={selectedProduct.hasPrint} /></div>
          <div className="dialog-info">
            <p className="product-category">{selectedProduct.category.name} <span>·</span> DROP 001</p>
            <button type="button" className="dialog-favorite" aria-pressed={favorites.includes(selectedProduct.id)} onClick={() => toggleFavorite(selectedProduct.id)}>{favorites.includes(selectedProduct.id) ? '♥ REMOVER DOS SALVOS' : '♡ SALVAR PEÇA'}</button>
            <h2 id="product-dialog-title">{selectedProduct.name}</h2>
            <p className="dialog-price">{selectedVariant ? brl(selectedVariant.priceCents) : selectedColorStartingPrice !== null ? `A PARTIR DE ${brl(selectedColorStartingPrice)}` : 'ESGOTADO'}</p>
            {selectedProduct.description && <p className="dialog-description">{selectedProduct.description}</p>}
            <fieldset className="variant-fieldset">
              <legend>ESCOLHA A COR <span>{color}</span></legend>
              <div className="swatches">{colors.map(([name, hex]) => <button type="button" key={name} className="swatch" style={{ '--swatch': hex } as CSSProperties} aria-label={name} aria-pressed={color === name} onClick={() => { setColor(name); setSize(''); }}>{name}</button>)}</div>
            </fieldset>
            <fieldset className="variant-fieldset">
              <legend>TAMANHO <span>{size || 'SELECIONE'}</span></legend>
              <div className="size-options">{variantsForColor.map((variant: Variant) => <button type="button" key={variant.id} aria-pressed={size === variant.size} disabled={variant.stockQty <= 0} onClick={() => setSize(variant.size)}>{variant.size}</button>)}</div>
              <p className="stock-note">{!variantsForColor.some((variant) => variant.stockQty > 0) ? 'ESGOTADO NESTA COR' : selectedVariant ? (selectedVariant.stockQty <= 3 ? `SÓ ${selectedVariant.stockQty} NO DROP` : 'DISPONÍVEL NO DROP') : 'ESTOQUE LIMITADO POR TAMANHO'}</p>
            </fieldset>
            <button className="add-to-bag" type="button" disabled={!selectedVariant || selectedVariant.stockQty <= 0} onClick={() => addToBag()}>
              {demo ? selectedVariant ? 'TESTAR NA SACOLA' : 'ESCOLHA COR E TAMANHO' : selectedVariant ? 'COLOCAR NA SACOLA' : 'ESCOLHA COR E TAMANHO'} <span aria-hidden="true">↗</span>
            </button>
            <Link className="full-product-link" href={`/produto/${selectedProduct.slug}`} onClick={() => setSelectedProduct(null)}>GUIA DE TAMANHOS E DETALHES DA PEÇA <span aria-hidden="true">→</span></Link>
            <p className="secure-note"><span aria-hidden="true">✳</span> {demo ? 'SACOLA DE DEMONSTRAÇÃO · SEM PEDIDO REAL' : checkoutEnabled ? 'PAGAMENTO SEGURO · ENVIO PARA TODO O BRASIL' : 'VENDAS EM PREPARAÇÃO · CHECKOUT DESATIVADO'}</p>
          </div>
        </section>
      </div>}
    </main>
  );
}
