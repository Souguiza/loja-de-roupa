'use client';

import { CSSProperties, useMemo, useState } from 'react';
import { Garment } from '@/components/Garment';
import { useCart } from '@/lib/cart';
import { brl, sizeRank } from '@/lib/format';
import { lowestAvailablePrice } from '@/lib/product-pricing.mjs';
import type { Product } from '@/lib/types';

const checkoutEnabled = process.env.NEXT_PUBLIC_CHECKOUT_ENABLED === 'true';

export function ProductPurchase({ product, demo = false }: { product: Product; demo?: boolean }) {
  const { add, favorites, toggleFavorite } = useCart();
  const [color, setColor] = useState(product.variants.find((variant) => variant.stockQty > 0)?.color ?? product.variants[0]?.color ?? '');
  const [size, setSize] = useState('');
  const [imageIndex, setImageIndex] = useState(0);

  const colors = useMemo(() => {
    const options = new Map<string, string>();
    product.variants.forEach((variant) => options.set(variant.color, variant.colorHex));
    return [...options];
  }, [product]);
  const options = product.variants.filter((variant) => variant.color === color).sort((a, b) => sizeRank(a.size) - sizeRank(b.size));
  const selected = options.find((variant) => variant.size === size);
  const lowest = lowestAvailablePrice(options);

  const buy = () => {
    if (!selected || selected.stockQty <= 0) return;
    add({
      variantId: selected.id,
      name: product.name,
      size: selected.size,
      color: selected.color,
      colorHex: selected.colorHex,
      shape: product.shape,
      hasPrint: product.hasPrint,
      priceCents: selected.priceCents,
      maxQty: selected.stockQty,
    });
  };

  return <div className="pdp-layout">
    <div className="pdp-gallery">
      <div className="pdp-main-image">
        {product.images[imageIndex] ? <img src={product.images[imageIndex].url} alt={`${product.name} — ${color}`} /> : <Garment shape={product.shape} fill={colors.find(([name]) => name === color)?.[1] ?? '#eceae6'} hasPrint={product.hasPrint} />}
        <span>AGAPE / DROP 001</span>
      </div>
      {product.images.length > 1 && <div className="pdp-thumbnails" aria-label="Fotos do produto">
        {product.images.map((image, index) => <button key={image.url} type="button" aria-label={`Ver foto ${index + 1}`} aria-pressed={imageIndex === index} onClick={() => setImageIndex(index)}><img src={image.url} alt="" /></button>)}
      </div>}
    </div>
    <section className="pdp-purchase" aria-labelledby="pdp-name">
      <p className="pdp-overline">{product.category.name} <span>·</span> DROP 001</p>
      <h1 id="pdp-name">{product.name}</h1>
      {product.ratingCount ? <a className="review-summary" href="#reviews" aria-label={`${product.ratingAverage?.toFixed(1)} de 5, ${product.ratingCount} avaliações verificadas`}>★ {product.ratingAverage?.toFixed(1)} <span>· {product.ratingCount} {product.ratingCount === 1 ? 'avaliação verificada' : 'avaliações verificadas'}</span></a> : <p className="review-summary review-empty">SEJA O PRIMEIRO A AVALIAR APÓS RECEBER</p>}
      <button type="button" className="dialog-favorite" aria-pressed={favorites.includes(product.id)} onClick={() => toggleFavorite(product.id)}>{favorites.includes(product.id) ? '♥ REMOVER DOS SALVOS' : '♡ SALVAR PEÇA'}</button>
      <p className="pdp-price">{selected ? brl(selected.priceCents) : lowest !== null ? `A PARTIR DE ${brl(lowest)}` : 'ESGOTADO'}</p>
      <p className="pdp-payment-hint">Preço varia conforme a cor e o tamanho selecionados.</p>
      {product.description && <p className="pdp-description">{product.description}</p>}

      {colors.length > 1 && <fieldset className="pdp-fieldset">
        <legend>ESCOLHA A COR <span>{color}</span></legend>
        <div className="swatches">{colors.map(([name, hex]) => <button key={name} type="button" className="swatch" style={{ '--swatch': hex } as CSSProperties} aria-label={name} aria-pressed={color === name} onClick={() => { setColor(name); setSize(''); }}>{name}</button>)}</div>
      </fieldset>}
      <fieldset className="pdp-fieldset">
        <legend>TAMANHO <span>{size || 'SELECIONE'}</span></legend>
        <div className="size-options">{options.map((variant) => <button key={variant.id} type="button" aria-pressed={size === variant.size} disabled={variant.stockQty <= 0} onClick={() => setSize(variant.size)}>{variant.size}</button>)}</div>
        <p className="stock-note">{!options.some((variant) => variant.stockQty > 0) ? 'ESGOTADO NESTA COR' : selected ? (selected.stockQty <= 3 ? `SÓ ${selected.stockQty} NO DROP` : 'DISPONÍVEL NO DROP') : 'ESTOQUE ATUALIZADO POR VARIAÇÃO'}</p>
      </fieldset>
      {demo && <p role="status" className="demo-purchase-note">CATÁLOGO DEMONSTRATIVO: você pode testar a sacola, mas nenhum pedido ou pagamento será enviado.</p>}
      {!demo && !checkoutEnabled && <p role="status" className="demo-purchase-note">VENDAS EM PREPARAÇÃO: o catálogo está disponível, mas ainda não é possível criar pedidos ou pagamentos.</p>}
      <button className="add-to-bag" type="button" disabled={!selected || selected.stockQty <= 0} onClick={buy}>{demo ? selected ? 'TESTAR NA SACOLA' : 'ESCOLHA O TAMANHO' : selected ? 'COLOCAR NA SACOLA' : 'ESCOLHA O TAMANHO'} <span aria-hidden="true">↗</span></button>
      {checkoutEnabled && <div className="trust-list"><p><b>01</b><span>Compra sem criar conta</span></p><p><b>02</b><span>Estoque por tamanho e cor</span></p><p><b>03</b><span>Envio para todo o Brasil</span></p></div>}
      <details className="pdp-accordion"><summary>COMO ESCOLHER MEU TAMANHO?</summary><p>Confira a etiqueta de uma peça sua com caimento parecido e compare com o tamanho disponível. A tabela de medidas específica será publicada junto às fotos reais de cada peça.</p></details>
      <details className="pdp-accordion"><summary>ENTREGA E TROCAS</summary><p>O prazo e o valor de entrega são informados antes da confirmação do pedido. Para solicitar uma troca, fale com o atendimento da Agape após receber sua peça.</p></details>
      {Boolean(product.reviews?.length) && <section id="reviews" className="product-reviews" aria-labelledby="reviews-title"><h2 id="reviews-title">QUEM JÁ VESTIU</h2>{product.reviews?.map((review) => <article key={review.id}><p className="review-stars" aria-label={`${review.rating} de 5 estrelas`}>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)} <span>COMPRA VERIFICADA</span></p><p>{review.comment}</p><time dateTime={review.createdAt}>{new Date(review.createdAt).toLocaleDateString('pt-BR')}</time></article>)}</section>}
    </section>
  </div>;
}
