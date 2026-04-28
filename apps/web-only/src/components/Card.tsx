import type { Card as CardType } from '../engine/types'

const SUIT_SYMBOLS: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' }
const SUIT_COLORS: Record<string, string> = {
  s: 'text-slate-900',
  h: 'text-red-500',
  d: 'text-red-500',
  c: 'text-slate-900',
}

function rankLabel(rank: number): string {
  if (rank === 11) return 'J'
  if (rank === 12) return 'Q'
  if (rank === 13) return 'K'
  if (rank === 14) return 'A'
  return String(rank)
}

interface CardProps {
  card?: CardType
  faceDown?: boolean
  highlight?: boolean
  small?: boolean
}

export default function Card({ card, faceDown = false, highlight = false, small = false }: CardProps) {
  const base = small
    ? 'w-8 h-11 rounded-md text-xs select-none'
    : 'w-11 h-16 rounded-lg text-sm select-none'

  if (faceDown || !card) {
    return (
      <div
        className={`${base} bg-slate-700 border border-slate-600 flex items-center justify-center`}
      >
        <div className="w-full h-full rounded-md bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center">
          <span className="text-slate-500 text-lg">🂠</span>
        </div>
      </div>
    )
  }

  const suitColor = SUIT_COLORS[card.suit] ?? 'text-white'
  const symbol = SUIT_SYMBOLS[card.suit] ?? '?'
  const rank = rankLabel(card.rank)

  return (
    <div
      className={`${base} bg-white flex flex-col justify-between p-0.5 font-bold
        ${highlight ? 'ring-2 ring-yellow-400 shadow-lg shadow-yellow-400/40' : 'border border-slate-300'}
      `}
    >
      <div className={`${suitColor} leading-none ${small ? 'text-xs' : 'text-sm'}`}>
        {rank}
        <span className="text-xs">{symbol}</span>
      </div>
      <div className={`${suitColor} leading-none text-center ${small ? 'text-base' : 'text-xl'}`}>
        {symbol}
      </div>
      <div className={`${suitColor} leading-none self-end rotate-180 ${small ? 'text-xs' : 'text-sm'}`}>
        {rank}
        <span className="text-xs">{symbol}</span>
      </div>
    </div>
  )
}
