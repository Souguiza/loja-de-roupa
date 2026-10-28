export type Shape = 'tee' | 'long' | 'tank';

export type Variant = {
  id: string;
  sku: string;
  size: string;
  color: string;
  colorHex: string;
  priceCents: number;
  compareAtPriceCents: number | null;
  stockQty: number;
};

export type Product = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  shape: Shape;
  hasPrint: boolean;
  category: { name: string; slug: string };
  images: { url: string }[];
  variants: Variant[];
  ratingAverage?: number | null;
  ratingCount?: number;
  reviews?: { id: string; rating: number; comment: string; createdAt: string }[];
};
