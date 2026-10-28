import { BRAND } from '@/lib/brand';
import type { Shape } from '@/lib/types';

const SHAPES: Record<Shape, string> = {
  tee: 'M70 40L100 52L130 40L174 64L160 98L138 88L138 218L62 218L62 88L40 98L26 64Z',
  long: 'M72 40L100 52L128 40L152 54L170 204L148 208L138 100L138 220L62 220L62 100L52 208L30 204L48 54Z',
  tank: 'M74 42L90 42Q100 72 110 42L126 42L138 84L138 218L62 218L62 84Z',
};

export function Garment({ shape, fill, hasPrint }: { shape: Shape; fill: string; hasPrint?: boolean }) {
  const d = SHAPES[shape] ?? SHAPES.tee;
  const ink = /^#[0-4]/.test(fill) ? '#f4f3ef' : '#1b1b1b';
  return (
    <svg viewBox="0 0 200 240" aria-hidden="true">
      <path d="M100 30V20a6 6 0 1 0-6-6" fill="none" stroke="#5a2c2c" strokeWidth="3" strokeLinecap="round" />
      <path d="M100 30L52 50M100 30L148 50" stroke="#5a2c2c" strokeWidth="5" strokeLinecap="round" />
      <path className="g" d={d} fill={fill} stroke="rgba(0,0,0,.25)" strokeWidth="1.2" strokeLinejoin="round" />
      <path d={d} fill="url(#fab)" />
      {hasPrint &&
        BRAND.printLines.map((t, i) => (
          <text
            key={t}
            className="g"
            x="100"
            y={116 + i * 18}
            textAnchor="middle"
            fontFamily="Arial Black,Impact,sans-serif"
            fontSize="17"
            fill={ink}
          >
            {t}
          </text>
        ))}
    </svg>
  );
}
