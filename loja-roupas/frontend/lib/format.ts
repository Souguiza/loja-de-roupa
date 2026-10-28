export const brl = (cents: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);

const ORDER = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'U'];
export const sizeRank = (s: string) => {
  const i = ORDER.indexOf(s.toUpperCase());
  return i === -1 ? 99 : i;
};
