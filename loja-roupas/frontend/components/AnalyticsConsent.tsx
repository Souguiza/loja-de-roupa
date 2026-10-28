'use client';

import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ANALYTICS_CONFIGURED, GA_MEASUREMENT_ID, META_PIXEL_ID } from '@/lib/analytics-config';

const CONSENT_KEY = 'agape:analytics-consent:v1';

type Choice = 'accepted' | 'rejected' | null;

export function AnalyticsConsent() {
  const pathname = usePathname();
  const [choice, setChoice] = useState<Choice>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [gaReady, setGaReady] = useState(false);
  const [metaReady, setMetaReady] = useState(false);
  const lastGaPath = useRef<string | null>(null);
  const lastMetaPath = useRef<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(CONSENT_KEY);
      if (saved === 'accepted' || saved === 'rejected') setChoice(saved);
    } catch { /* sem armazenamento: não carregar tags opcionais */ }
    setReady(true);
    const showPreferences = () => setOpen(true);
    window.addEventListener('agape:open-privacy-preferences', showPreferences);
    return () => window.removeEventListener('agape:open-privacy-preferences', showPreferences);
  }, []);

  useEffect(() => {
    if (!ready || !choice) return;
    try { localStorage.setItem(CONSENT_KEY, choice); } catch { /* sem armazenamento */ }
    if (choice === 'accepted') {
      window.gtag?.('consent', 'update', { analytics_storage: 'granted', ad_storage: 'granted' });
      window.fbq?.('consent', 'grant');
    } else {
      window.gtag?.('consent', 'update', { analytics_storage: 'denied', ad_storage: 'denied' });
      window.fbq?.('consent', 'revoke');
    }
  }, [choice, ready]);

  useEffect(() => {
    if (choice !== 'accepted') {
      lastGaPath.current = null;
      lastMetaPath.current = null;
      setGaReady(false);
      setMetaReady(false);
      return;
    }
    if (!pathname || pathname.startsWith('/admin')) return;
    if (gaReady && lastGaPath.current !== pathname && window.gtag) {
      const currentUrl = new URL(window.location.href);
      const campaignParams = new URLSearchParams();
      for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_id', 'utm_content', 'utm_term', 'gclid', 'dclid', 'fbclid']) {
        const value = currentUrl.searchParams.get(key);
        if (value) campaignParams.set(key, value);
      }
      const campaignQuery = campaignParams.toString();
      window.gtag('event', 'page_view', {
        page_path: pathname,
        page_location: `${currentUrl.origin}${pathname}${campaignQuery ? `?${campaignQuery}` : ''}`,
        page_title: document.title,
      });
      lastGaPath.current = pathname;
    }
    if (metaReady && lastMetaPath.current !== pathname && window.fbq) {
      window.fbq('track', 'PageView');
      lastMetaPath.current = pathname;
    }
  }, [choice, pathname, gaReady, metaReady]);

  const choose = (value: Exclude<Choice, null>) => {
    try { localStorage.setItem(CONSENT_KEY, value); } catch { /* a escolha vale durante esta sessão */ }
    setChoice(value);
    setOpen(false);
    window.dispatchEvent(new CustomEvent('agape:analytics-consent-changed', { detail: value }));
  };

  if (!ANALYTICS_CONFIGURED || !ready) return null;

  return <>
    {choice === 'accepted' && GA_MEASUREMENT_ID && <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`} strategy="afterInteractive" />
      <Script id="agape-gtag-init" strategy="afterInteractive" onReady={() => setGaReady(true)} dangerouslySetInnerHTML={{ __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;gtag('js',new Date());gtag('config',${JSON.stringify(GA_MEASUREMENT_ID)},{anonymize_ip:true,send_page_view:false});` }} />
    </>}
    {choice === 'accepted' && META_PIXEL_ID && <Script id="agape-meta-pixel" strategy="afterInteractive" onReady={() => setMetaReady(true)} dangerouslySetInnerHTML={{ __html: `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('consent','grant');fbq('init',${JSON.stringify(META_PIXEL_ID)});` }} />}
    {choice === null || open ? <aside className="consent-banner" role="dialog" aria-modal="false" aria-labelledby="consent-title">
      <div><p className="eyebrow">AGAPE / SUA PRIVACIDADE</p><h2 id="consent-title">Você escolhe os cookies.</h2><p>Os recursos essenciais mantêm a sacola e a loja funcionando. Com sua autorização, usamos {GA_MEASUREMENT_ID && 'Google Analytics'}{GA_MEASUREMENT_ID && META_PIXEL_ID && ' e '}{META_PIXEL_ID && 'Meta Pixel'} para entender visitas e melhorar a divulgação.</p><a href="/privacidade">Leia a política de privacidade</a></div>
      <div className="consent-actions"><button type="button" className="consent-reject" onClick={() => choose('rejected')}>SÓ ESSENCIAIS</button><button type="button" onClick={() => choose('accepted')}>ACEITAR OPCIONAIS</button></div>
    </aside> : <button className="consent-preferences" type="button" onClick={() => setOpen(true)}>PREFERÊNCIAS DE PRIVACIDADE</button>}
  </>;
}

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: ((...args: unknown[]) => void) & { callMethod?: (...args: unknown[]) => void; queue?: unknown[]; loaded?: boolean; version?: string };
    _fbq?: Window['fbq'];
  }
}
