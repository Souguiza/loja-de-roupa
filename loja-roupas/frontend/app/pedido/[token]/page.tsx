import type { Metadata } from 'next';
import Image from 'next/image';
import { OrderStatusClient } from '@/components/OrderStatusClient';
import { brl } from '@/lib/format';
import { OrderReviewForm } from '@/components/OrderReviewForm';

export const metadata: Metadata = { title: 'Acompanhar pedido | Agape', robots: { index: false, follow: false } };

type Status = { number: number; status: string; totalCents: number; shippingMethod: string | null; trackingCode: string | null; createdAt: string; items: { variantId: string; productName: string; size: string; color: string; quantity: number; unitPriceCents: number; variant: { product: { slug: string } } }[]; payments: { status: string; method: string; paidAt: string | null }[] };
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

async function getStatus(token: string): Promise<Status | null> {
  try { const response = await fetch(`${API}/orders/status/${encodeURIComponent(token)}`, { cache: 'no-store' }); return response.ok ? await response.json() as Status : null; }
  catch { return null; }
}

export default async function OrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const order = await getStatus(token);
  return <main className="order-status-page">
    <a className="logo" href="/"><span className="logo-mark" aria-hidden="true"><Image src="/agape-logo.png" alt="" width={44} height={44} /></span><span className="logo-word">Agape</span><small>MS</small></a>
    {!order ? <section><p className="eyebrow">AGAPE / PEDIDO</p><h1>Não foi possível localizar este pedido</h1><p>Se acabou de pagar, aguarde alguns instantes e consulte novamente pelo mesmo link.</p><a className="buy" href="/">VOLTAR À LOJA</a></section> : <section>
      <OrderStatusClient number={order.number} status={order.status} totalCents={order.totalCents} items={order.items} />
      <p className="eyebrow">AGAPE / ACOMPANHAMENTO</p><h1>PEDIDO #{order.number}</h1>
      <p className="order-status-label">{order.status === 'AWAITING_PAYMENT' ? 'Aguardando a confirmação do pagamento pelo Mercado Pago.' : order.status === 'PAID' ? 'Pagamento confirmado. Vamos preparar sua peça.' : order.status === 'PROCESSING' ? 'Seu pagamento foi confirmado e estamos preparando o pedido.' : order.status === 'SHIPPED' ? 'Seu pedido foi enviado. Acompanhe pelo código de rastreio abaixo.' : order.status === 'DELIVERED' ? 'Pedido entregue. Esperamos que você goste da peça!' : 'Este pedido foi cancelado.'}</p>
      <p>{new Date(order.createdAt).toLocaleDateString('pt-BR')} · {order.shippingMethod ?? 'Entrega a definir'}</p>
      {order.trackingCode && <p>Código de rastreio: <strong>{order.trackingCode}</strong></p>}
      <h2>ITENS</h2><ul>{order.items.map((item, index) => <li key={index}>{item.quantity}× {item.productName} · {item.color} / {item.size}</li>)}</ul>
      <p>Total do pedido: <strong>{brl(order.totalCents)}</strong></p>
      <p>Pagamento: {order.payments[0]?.status === 'APPROVED' ? 'aprovado' : order.payments[0]?.status === 'REFUSED' ? 'recusado' : 'pendente'}</p>
      <a href="/">CONTINUAR NA LOJA ↗</a>
      {order.status === 'DELIVERED' && <section className="order-review-section"><p className="eyebrow">SUA VOZ FAZ PARTE DO DROP</p><h2>COMO FOI VESTIR?</h2><p>As avaliações são vinculadas a uma compra entregue e passam por revisão antes de aparecer na loja.</p>{[...new Map(order.items.map((item) => [item.variant.product.slug, item])).values()].map((item) => <OrderReviewForm key={item.variant.product.slug} slug={item.variant.product.slug} productName={item.productName} token={token} />)}</section>}
    </section>}
  </main>;
}
