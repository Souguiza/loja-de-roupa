export type StockPricedVariant = {
  priceCents: number;
  stockQty: number;
};

export function lowestAvailablePrice(variants: readonly StockPricedVariant[]): number | null;
