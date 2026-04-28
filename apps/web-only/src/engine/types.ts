export type Suit = 's' | 'h' | 'd' | 'c'
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14

export interface Card {
  rank: Rank
  suit: Suit
}

export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown'

export type ActionType = 'fold' | 'check' | 'call' | 'raise' | 'allin'

export type HandCategory =
  | 'highCard'
  | 'pair'
  | 'twoPair'
  | 'threeOfAKind'
  | 'straight'
  | 'flush'
  | 'fullHouse'
  | 'fourOfAKind'
  | 'straightFlush'
  | 'royalFlush'

export interface RoomConfig {
  seatsMax: number
  smallBlind: number
  bigBlind: number
  initialChips: number
  maxRebuy: number
  timeoutSec: number
}

export interface WinnerInfo {
  playerId: string
  nickname: string
  amount: number
  hand?: {
    cards: Card[]
    category: HandCategory
    description: string
  }
}
