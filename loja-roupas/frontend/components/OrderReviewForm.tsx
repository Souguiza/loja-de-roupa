'use client';

import { FormEvent, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

export function OrderReviewForm({ slug, productName, token }: { slug: string; productName: string; token: string }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setMessage('');
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`${API}/products/${encodeURIComponent(slug)}/reviews`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicToken: token, rating: Number(form.get('rating')), comment: String(form.get('comment')) }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(Array.isArray(data?.message) ? data.message.join(', ') : data?.message ?? 'Não foi possível enviar a avaliação.');
      setMessage('Obrigado! Sua avaliação foi enviada e será publicada após uma revisão rápida.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível enviar a avaliação.'); }
    finally { setBusy(false); }
  }

  return <form className="order-review-form" onSubmit={submit}>
    <h3>{productName}</h3>
    <label>NOTA<select name="rating" defaultValue="5"><option value="5">★★★★★ · 5</option><option value="4">★★★★☆ · 4</option><option value="3">★★★☆☆ · 3</option><option value="2">★★☆☆☆ · 2</option><option value="1">★☆☆☆☆ · 1</option></select></label>
    <label>SUA EXPERIÊNCIA<textarea name="comment" minLength={10} maxLength={800} required placeholder="Conte como foi vestir sua peça…" /></label>
    {message && <p role="status">{message}</p>}
    {!message.startsWith('Obrigado!') && <button className="small-action" type="submit" disabled={busy}>{busy ? 'ENVIANDO…' : 'ENVIAR AVALIAÇÃO'}</button>}
  </form>;
}
