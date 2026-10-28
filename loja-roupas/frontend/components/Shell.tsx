'use client';
import { ReactNode, useEffect, useState } from 'react';
import Image from 'next/image';
import { CartDrawer } from './CartDrawer';
import { BRAND } from '@/lib/brand';
import { useCart } from '@/lib/cart';
import { usePathname } from 'next/navigation';

export function Shell({ children }: { children: ReactNode }) {
  const { count, favorites, setOpen } = useCart();
  const pathname = usePathname();
  const [panel, setPanel] = useState<'contato' | null>(null);

  useEffect(() => {
    if (!panel) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>('.panel-box');
    const controls = () => [...(dialog?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])') ?? [])];
    controls()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setPanel(null); return; }
      if (e.key !== 'Tab') return;
      const focusable = controls();
      if (!focusable.length) { e.preventDefault(); return; }
      if (e.shiftKey && document.activeElement === focusable[0]) { e.preventDefault(); focusable.at(-1)?.focus(); }
      else if (!e.shiftKey && document.activeElement === focusable.at(-1)) { e.preventDefault(); focusable[0].focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); previousFocus?.focus(); };
  }, [panel]);

  if (pathname.startsWith('/admin')) return <>{children}</>;

  const ticker = BRAND.ticker.map((m) => `${m} /`);
  const loop = [...ticker, ...ticker, ...ticker, ...ticker];
  const dropHref = pathname === '/' ? '#drop' : '/#drop';
  const lookbookHref = pathname === '/' ? '#lookbook' : '/#lookbook';
  const searchHref = pathname === '/' ? '#busca' : '/#busca';

  return (
    <>
      <header className="site-header">
        <a className="logo" href="/" aria-label={`${BRAND.name}, página inicial`}>
          <span className="logo-mark" aria-hidden="true"><Image src="/agape-logo.png" alt="" width={44} height={44} priority /></span><span className="logo-word">{BRAND.name}</span><small>MS</small>
        </a>
        <nav className="main-nav" aria-label="Navegação principal">
          <a href={dropHref}>LOJA</a>
          <a href={lookbookHref}>LOOKBOOK</a>
          <a href={searchHref}>BUSCA</a>
        </nav>
        <div className="hright">
          <button type="button" onClick={() => setPanel('contato')}>CONTATO</button>
          <a className="favorites-link" href="/favoritos" aria-label={`Peças salvas, ${favorites.length}`}>SALVOS <span>{favorites.length.toString().padStart(2, '0')}</span></a>
          <a className="owner-entry" href="/admin" aria-label="Acesso do lojista" title="Acesso do lojista">PAINEL</a>
          <button className="bag-button" type="button" onClick={() => setOpen(true)} aria-label={`Abrir sacola, ${count} itens`}>
            SACOLA <span>{count.toString().padStart(2, '0')}</span>
          </button>
        </div>
      </header>

      {children}

      <div id="tick" aria-hidden="true">
        <div>
          {loop.map((m, i) => (
            <span key={i}>{m}</span>
          ))}
        </div>
      </div>

      <CartDrawer />

      {panel && (
        <div className="panel" role="dialog" aria-modal="true" onClick={() => setPanel(null)}>
          <div className="panel-box" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="panel-x" onClick={() => setPanel(null)} autoFocus>
              FECHAR ✕
            </button>
            {BRAND.contact.map((c) => <p key={c}>{c}</p>)}
            <a className="panel-social" href={BRAND.whatsappUrl} target="_blank" rel="noreferrer">CHAMAR NO WHATSAPP ↗</a>
            <a className="panel-social" href={BRAND.instagramUrl} target="_blank" rel="noreferrer">INSTAGRAM {BRAND.instagramHandle} ↗</a>
          </div>
        </div>
      )}
    </>
  );
}
