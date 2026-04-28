import type { Card, Suit, Rank } from './types'

const SUITS: Suit[] = ['s', 'h', 'd', 'c']
const RANKS: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]

export function createDeck(): Card[] {
  const deck: Card[] = []
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit })
    }
  }
  return deck
}

export function shuffle(deck: Card[], rng: () => number): Card[] {
  const result = [...deck]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = result[i]!
    result[i] = result[j]!
    result[j] = tmp
  }
  return result
}

export function cryptoRng(): () => number {
  return () => {
    const buf = new Uint32Array(1)
    crypto.getRandomValues(buf)
    return buf[0]! / 0x100000000
  }
}
