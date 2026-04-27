import { motion } from 'framer-motion';
import type { Card as CardType } from '@poker/shared';

const SUIT_SYMBOLS: Record<string, string> = {
  s: '♠',
  h: '♥',
  d: '♦',
  c: '♣',
};

const SUIT_COLORS: Record<string, string> = {
  s: 'text-slate-900',
  h: 'text-red-600',
  d: 'text-red-600',
  c: 'text-slate-900',
};

const RANK_DISPLAY: Record<number, string> = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7',
  8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A',
};

interface CardProps {
  card?: CardType;
  faceDown?: boolean;
  highlight?: boolean;
  small?: boolean;
  animate?: boolean;
}

export default function Card({ card, faceDown = false, highlight = false, small = false, animate = false }: CardProps) {
  const baseClass = small
    ? 'w-8 h-12 rounded text-xs'
    : 'w-14 h-20 rounded-lg text-sm';

  if (faceDown || !card) {
    return (
      <div className={`${baseClass} card-back flex items-center justify-center`}>
        <div className="text-blue-300 opacity-50 text-lg">🂠</div>
      </div>
    );
  }

  const suitSymbol = SUIT_SYMBOLS[card.suit] ?? '?';
  const suitColor = SUIT_COLORS[card.suit] ?? 'text-slate-900';
  const rankDisplay = RANK_DISPLAY[card.rank] ?? String(card.rank);

  const cardEl = (
    <div className={`
      ${baseClass} card-face flex flex-col justify-between p-1 select-none
      ${highlight ? 'ring-2 ring-yellow-400 shadow-yellow-400/50 shadow-lg' : ''}
      ${suitColor}
    `}>
      <div className="font-bold leading-none">{rankDisplay}</div>
      <div className="self-center text-lg leading-none">{suitSymbol}</div>
      <div className="font-bold leading-none self-end rotate-180">{rankDisplay}</div>
    </div>
  );

  if (animate) {
    return (
      <motion.div
        initial={{ y: -80, opacity: 0, rotate: -10 }}
        animate={{ y: 0, opacity: 1, rotate: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        {cardEl}
      </motion.div>
    );
  }

  return cardEl;
}
