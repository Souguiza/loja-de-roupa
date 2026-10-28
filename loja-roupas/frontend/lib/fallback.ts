import type { Product, Shape } from './types';

const SIZES = ['P', 'M', 'G', 'GG'];
const slug = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const RAW: { n: string; cat: string; shape: Shape; price: number; description: string; print?: boolean; c: [string, string][] }[] = [
  { n: 'Bando 067', cat: 'Camisetas', shape: 'tee', price: 8990, description: 'Uma peça de presença pro seu corre. O 067 carrega nossa origem sem limitar até onde você pode chegar.', print: true, c: [['Preto', '#20221d'], ['Osso', '#e9e5d9']] },
  { n: 'Faixa Sul', cat: 'Camisetas', shape: 'tee', price: 8990, description: 'Minimal no detalhe, forte no conjunto. Feita pra entrar na sua rotação de todo dia.', print: true, c: [['Dourado', '#d5b46c'], ['Preto', '#20221d'], ['Osso', '#e9e5d9']] },
  { n: 'Regata Frequência', cat: 'Regatas', shape: 'tank', price: 7490, description: 'Leve no corpo, sem baixar o volume. Uma silhueta direta para os dias que pedem movimento.', c: [['Grafite', '#4a4a48'], ['Preto', '#20221d']] },
  { n: 'Linha de Fuga', cat: 'Camisetas', shape: 'long', price: 10990, description: 'Modelagem ampla e presença fora do eixo. Uma peça para fazer seu próprio caminho.', print: true, c: [['Preto', '#20221d'], ['Areia', '#d7c8aa']] },
  { n: 'Noite no Centro', cat: 'Camisetas', shape: 'long', price: 11990, description: 'Camada leve para quando o rolê continua depois que o sol baixa.', c: [['Azul noite', '#28334a'], ['Preto', '#20221d']] },
  { n: 'Ponto de Encontro', cat: 'Camisetas', shape: 'tee', price: 8990, description: 'A camiseta que começa a conversa. Inspirada nos encontros que fazem a cidade girar.', print: true, c: [['Terracota', '#b96848'], ['Osso', '#e9e5d9']] },
  { n: 'Arquivo 001', cat: 'Camisetas', shape: 'tee', price: 9990, description: 'Primeiro registro de um bando em movimento. Edição de demonstração da coleção Agape.', print: true, c: [['Preto', '#20221d'], ['Dourado', '#d5b46c']] },
];

// Coleção de demonstração, usada só quando a API não responde.
export const FALLBACK: Product[] = RAW.map((r, pi) => ({
  id: `demo-${pi}`,
  name: r.n,
  slug: slug(r.n),
  description: r.description,
  shape: r.shape,
  hasPrint: !!r.print,
  category: { name: r.cat, slug: slug(r.cat) },
  images: [],
  variants: r.c.flatMap(([color, colorHex], ci) =>
    SIZES.map((size) => ({
      id: `demo-${pi}-${ci}-${size}`,
      sku: `${slug(r.n)}-${slug(color)}-${size}`.toUpperCase(),
      size,
      color,
      colorHex,
      priceCents: r.price,
      compareAtPriceCents: null,
      stockQty: 6,
    })),
  ),
}));
