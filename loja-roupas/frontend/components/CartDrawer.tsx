'use client';
import { useEffect } from 'react';
import { Garment } from './Garment';
import { useCart } from '@/lib/cart';
import { brl } from '@/lib/format';
import { createOrder, quoteShipping, validateCoupon } from '@/lib/api';
import { trackStoreEvent } from '@/lib/analytics-config';
import { FormEvent, useRef, useState } from 'react';

const checkoutEnabled = process.env.NEXT_PUBLIC_CHECKOUT_ENABLED === 'true';

export function CartDrawer() {
  const { items, isOpen, setOpen, setQty, remove, subtotalCents, clear } = useCart();
  const [checkout, setCheckout] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [quotes, setQuotes] = useState<Awaited<ReturnType<typeof quoteShipping>>>([]);
  const [selectedQuote, setSelectedQuote] = useState('');
  const [quoting, setQuoting] = useState(false);
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState<{ code: string; discountCents: number } | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [whatsappConsent, setWhatsappConsent] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const hasDemoItems = items.some((item) => item.variantId.startsWith('demo-'));

  const calculateShipping = async (formElement: HTMLFormElement) => {
    setError(''); setQuoting(true); setQuotes([]); setSelectedQuote('');
    const form = new FormData(formElement);
    try {
      const rates = await quoteShipping({ cep: String(form.get('cep')).replace(/\D/g, ''), items: items.map((i) => ({ variantId: i.variantId, quantity: i.qty })) });
      setQuotes(rates); if (rates.length === 1) setSelectedQuote(rates[0].id);
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível calcular o frete'); }
    finally { setQuoting(false); }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(''); setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const order = await createOrder({
        name: String(form.get('name')), email: String(form.get('email')), phone: String(form.get('phone') || ''),
        whatsappUpdates: form.get('whatsappUpdates') === 'on',
        shippingQuoteId: selectedQuote,
        ...(coupon ? { couponCode: coupon.code } : {}),
        items: items.map((i) => ({ variantId: i.variantId, quantity: i.qty })),
        address: {
          cep: String(form.get('cep')).replace(/\D/g, ''), street: String(form.get('street')),
          number: String(form.get('number')), complement: String(form.get('complement') || ''),
          neighborhood: String(form.get('neighborhood')), city: String(form.get('city')), state: String(form.get('state')).toUpperCase(),
        },
      });
      window.location.assign(order.checkoutUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível finalizar o pedido');
    } finally { setBusy(false); }
  };

  useEffect(() => {
    if (!isOpen) return;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const previousFocus = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const focusable = () => [...(dialog?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])') ?? [])];
    focusable()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); return; }
      if (e.key !== 'Tab') return;
      const controls = focusable();
      if (!controls.length) { e.preventDefault(); return; }
      if (e.shiftKey && document.activeElement === controls[0]) { e.preventDefault(); controls.at(-1)?.focus(); }
      else if (!e.shiftKey && document.activeElement === controls.at(-1)) { e.preventDefault(); controls[0].focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousBodyOverflow;
      previousFocus?.focus();
    };
  }, [isOpen, setOpen]);

  if (!isOpen) return null;

  return (
    <>
      <div id="scrim" onClick={() => setOpen(false)} />
      <aside id="cart" ref={dialogRef} role="dialog" aria-modal="true" aria-label="Sacola">
        <div className="cart-head">
          <strong>SACOLA</strong>
          <button type="button" onClick={() => setOpen(false)}>
            FECHAR ✕
          </button>
        </div>
        <div className="cart-list">
          {items.length === 0 && <p className="mute">SUA SACOLA ESTÁ VAZIA.</p>}
          {items.map((i) => (
            <div className="cart-item" key={i.variantId}>
              <div className="cart-thumb">
                <Garment shape={i.shape} fill={i.colorHex} hasPrint={i.hasPrint} />
              </div>
              <div className="cart-info">
                <div className="cart-name">{i.name}</div>
                <div className="mute">
                  {i.color.toUpperCase()} / {i.size}
                </div>
                <div className="qty">
                  <button type="button" aria-label="Diminuir" onClick={() => setQty(i.variantId, i.qty - 1)}>
                    −
                  </button>
                  <span>{i.qty}</span>
                  <button
                    type="button"
                    aria-label="Aumentar"
                    disabled={i.qty >= i.maxQty}
                    onClick={() => setQty(i.variantId, i.qty + 1)}
                  >
                    +
                  </button>
                  <button type="button" className="rm" onClick={() => remove(i.variantId)}>
                    REMOVER
                  </button>
                </div>
              </div>
              <div className="cart-price">{brl(i.priceCents * i.qty)}</div>
            </div>
          ))}
        </div>
        <div className="cart-foot">
          <div className="cart-sub">
            <span>SUBTOTAL</span>
            <strong>{brl(subtotalCents)}</strong>
          </div>
          {success ? <p role="status" className="checkout-success">{success}</p> : hasDemoItems ? <>
            <p role="status" className="demo-purchase-note">SACOLA DE DEMONSTRAÇÃO · preços e estoque fictícios. Não será criado pedido nem enviado pagamento.</p>
            <button className="buy" type="button" disabled>CHECKOUT DEMONSTRATIVO</button>
            <button className="checkout-back" type="button" onClick={clear}>LIMPAR SACOLA</button>
          </> : !checkoutEnabled ? <>
            <p className="mute">A finalização será liberada quando pagamento e frete estiverem conectados.</p>
            <button className="buy" type="button" disabled>CHECKOUT EM PREPARAÇÃO</button>
          </> : checkout ? (
            <form className="checkout-form" onSubmit={submit}>
              <p className="checkout-step-title">01 · ENTREGA</p>
              <div className="checkout-grid">
                <label className="wide">CEP<input name="cep" inputMode="numeric" pattern="[0-9.\-]{8,10}" autoComplete="postal-code" required onChange={() => { setQuotes([]); setSelectedQuote(''); }} /></label>
              </div>
              <button type="button" className="checkout-back" disabled={quoting || busy} onClick={(event) => { const form = event.currentTarget.form; const cep = form?.elements.namedItem('cep') as HTMLInputElement | null; if (form && cep?.reportValidity()) void calculateShipping(form); }}> {quoting ? 'CALCULANDO…' : 'CALCULAR FRETE PELO CEP'} </button>
              {quotes.length > 0 && <fieldset className="shipping-options"><legend>Escolha a entrega</legend>{quotes.map((quote) => <label key={quote.id}><input type="radio" name="shippingQuote" checked={selectedQuote === quote.id} onChange={() => setSelectedQuote(quote.id)} /> {quote.companyName} · {quote.serviceName} · {brl(quote.priceCents)} · {quote.deliveryDays} dias úteis</label>)}</fieldset>}

              <p className="checkout-step-title">02 · SEUS DADOS</p>
              <div className="checkout-grid">
                <label>Nome<input name="name" autoComplete="name" minLength={2} required /></label>
                <label>E-mail<input name="email" type="email" autoComplete="email" required /></label>
                <label>Telefone<input name="phone" type="tel" autoComplete="tel" inputMode="tel" required={whatsappConsent} aria-required={whatsappConsent} /></label>
                <label className="wide" style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}><input name="whatsappUpdates" type="checkbox" checked={whatsappConsent} onChange={(event) => setWhatsappConsent(event.target.checked)} style={{ marginTop: 3 }} /> Quero receber atualizações deste pedido por WhatsApp. Não enviaremos ofertas.</label>
              </div>

              <p className="checkout-step-title">03 · ENDEREÇO DE ENTREGA</p>
              <div className="checkout-grid">
                <label className="wide">Rua<input name="street" autoComplete="address-line1" required /></label>
                <label>Número<input name="number" required /></label>
                <label>Complemento<input name="complement" /></label>
                <label>Bairro<input name="neighborhood" required /></label>
                <label>Cidade<input name="city" autoComplete="address-level2" required /></label>
                <label>UF<input name="state" maxLength={2} autoComplete="address-level1" required /></label>
              </div>
              <div className="coupon-entry"><label htmlFor="coupon-code">Cupom de desconto</label><div><input id="coupon-code" value={couponInput} maxLength={32} onChange={(e) => { setCouponInput(e.target.value); setCoupon(null); }} placeholder="Digite seu cupom" /><button type="button" disabled={couponBusy || !couponInput.trim()} onClick={async () => { setCouponBusy(true); setError(''); try { const result = await validateCoupon({ code: couponInput, items: items.map((i) => ({ variantId: i.variantId, quantity: i.qty })) }); setCoupon({ code: result.code, discountCents: result.discountCents }); setCouponInput(result.code); } catch (e) { setError(e instanceof Error ? e.message : 'Cupom inválido'); setCoupon(null); } finally { setCouponBusy(false); } }}>{couponBusy ? 'VERIFICANDO…' : coupon ? 'APLICADO' : 'APLICAR'}</button></div>{coupon && <p role="status">{coupon.code} aplicado · {brl(coupon.discountCents)} de desconto</p>}</div>
              <div className="checkout-total"><span>Frete <strong>{quotes.find((q) => q.id === selectedQuote) ? brl(quotes.find((q) => q.id === selectedQuote)!.priceCents) : 'CALCULE'}</strong></span>{coupon && <span>Desconto <strong>− {brl(coupon.discountCents)}</strong></span>}<span>Total <strong>{quotes.find((q) => q.id === selectedQuote) ? brl(subtotalCents - (coupon?.discountCents ?? 0) + quotes.find((q) => q.id === selectedQuote)!.priceCents) : '—'}</strong></span></div>
              <p className="mute">Pagamento seguro no Mercado Pago. PIX e cartão disponíveis no checkout.</p>
              {error && <p role="alert" className="checkout-error">{error}</p>}
              <button className="buy" type="submit" disabled={busy || !selectedQuote}>{busy ? 'ABRINDO PAGAMENTO…' : 'IR PARA O PAGAMENTO'}</button>
              <button type="button" className="checkout-back" onClick={() => { setCheckout(false); setError(''); }}>VOLTAR À SACOLA</button>
            </form>
          ) : <>
            <p className="mute">Calcule a entrega pelo seu CEP antes de pagar.</p>
            <button className="buy" type="button" disabled={!items.length} onClick={() => { trackStoreEvent('begin_checkout', { currency: 'BRL', value: subtotalCents / 100, items: items.map((item) => ({ item_id: item.variantId, item_name: item.name, quantity: item.qty, price: item.priceCents / 100 })) }); setCheckout(true); }}>FINALIZAR COMPRA</button>
          </>}
        </div>
      </aside>
    </>
  );
}
