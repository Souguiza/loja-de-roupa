'use client';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Shape } from './types';

export type CartItem = {
  variantId: string;
  name: string;
  size: string;
  color: string;
  colorHex: string;
  shape: Shape;
  hasPrint: boolean;
  priceCents: number;
  qty: number;
  maxQty: number;
};

type Ctx = {
  items: CartItem[];
  favorites: string[];
  count: number;
  subtotalCents: number;
  isOpen: boolean;
  setOpen: (o: boolean) => void;
  add: (item: Omit<CartItem, 'qty'>) => void;
  setQty: (variantId: string, qty: number) => void;
  remove: (variantId: string) => void;
  clear: () => void;
  toggleFavorite: (productId: string) => void;
};

const CartContext = createContext<Ctx | null>(null);
const KEY = 'loja:cart:v2';
const FAVORITES_KEY = 'loja:favorites:v1';

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [isOpen, setOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setItems(JSON.parse(raw) as CartItem[]);
      const savedFavorites = localStorage.getItem(FAVORITES_KEY);
      if (savedFavorites) {
        const parsed: unknown = JSON.parse(savedFavorites);
        if (Array.isArray(parsed)) setFavorites(parsed.filter((id): id is string => typeof id === 'string'));
      }
    } catch {
      /* carrinho vazio */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(items));
    } catch {
      /* sem armazenamento */
    }
  }, [items, ready]);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites)); } catch { /* sem armazenamento */ }
  }, [favorites, ready]);

  const toggleFavorite = useCallback((productId: string) => {
    setFavorites((current) => current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId]);
  }, []);

  const add = useCallback((item: Omit<CartItem, 'qty'>) => {
    setItems((prev) => {
      const found = prev.find((i) => i.variantId === item.variantId);
      if (found) {
        return prev.map((i) =>
          i.variantId === item.variantId ? { ...i, qty: Math.min(i.qty + 1, item.maxQty), maxQty: item.maxQty } : i,
        );
      }
      return [...prev, { ...item, qty: 1 }];
    });
    setOpen(true);
  }, []);

  const setQty = useCallback((variantId: string, qty: number) => {
    setItems((prev) =>
      prev
        .map((i) => (i.variantId === variantId ? { ...i, qty: Math.min(qty, i.maxQty) } : i))
        .filter((i) => i.qty > 0),
    );
  }, []);

  const remove = useCallback((variantId: string) => {
    setItems((prev) => prev.filter((i) => i.variantId !== variantId));
  }, []);
  const clear = useCallback(() => setItems([]), []);

  const value = useMemo<Ctx>(
    () => ({
      items,
      favorites,
      count: items.reduce((n, i) => n + i.qty, 0),
      subtotalCents: items.reduce((n, i) => n + i.qty * i.priceCents, 0),
      isOpen,
      setOpen,
      add,
      setQty,
      remove,
      clear,
      toggleFavorite,
    }),
    [items, favorites, isOpen, add, setQty, remove, clear, toggleFavorite],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart precisa estar dentro de <CartProvider>');
  return ctx;
}
