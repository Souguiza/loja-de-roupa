export function lowestAvailablePrice(variants) {
  let lowest = null;

  for (const variant of variants) {
    if (!Number.isSafeInteger(variant.stockQty) || variant.stockQty <= 0 || !Number.isSafeInteger(variant.priceCents) || variant.priceCents <= 0) continue;
    if (lowest === null || variant.priceCents < lowest) lowest = variant.priceCents;
  }

  return lowest;
}
