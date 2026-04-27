export type Suit = 's' | 'h' | 'd' | 'c';
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export interface Card {
  rank: Rank;
  suit: Suit;
}

export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

export type ActionType = 'fold' | 'check' | 'call' | 'raise' | 'allin';

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
  | 'royalFlush';

export interface RoomConfig {
  seatsMax: number;
  smallBlind: number;
  bigBlind: number;
  initialChips: number;
  maxRebuy: number;
  timeoutSec: number;
}

export type PlayerStatus = 'waiting' | 'playing' | 'folded' | 'allin' | 'sitout' | 'disconnected';

export interface PlayerPublicState {
  playerId: string;
  deviceId: string;
  nickname: string;
  seatIndex: number;
  chips: number;
  currentBet: number;
  status: PlayerStatus;
  isHost: boolean;
  rebuyCount: number;
  isConnected: boolean;
  hasCards: boolean;
}

export interface Pot {
  amount: number;
  eligiblePlayerIds: string[];
}

export interface GameState {
  street: Street;
  board: Card[];
  pots: Pot[];
  totalPot: number;
  dealerSeat: number;
  sbSeat: number;
  bbSeat: number;
  currentSeat: number | null;
  handNumber: number;
  minRaise: number;
  lastRaiseAmount: number;
  timeoutAt: number | null;
  isPaused: boolean;
}

export interface RoomState {
  roomId: string;
  config: RoomConfig;
  players: PlayerPublicState[];
  game: GameState | null;
  phase: 'lobby' | 'playing' | 'ended';
  handHistory: HandHistorySummary[];
}

export interface HandHistorySummary {
  handNumber: number;
  winnerId: string;
  winnerNickname: string;
  amount: number;
  playedAt: number;
}

export interface ChatMessage {
  id: string;
  playerId: string;
  nickname: string;
  content: string;
  type: 'text' | 'emoji';
  timestamp: number;
}

export interface WinnerInfo {
  playerId: string;
  nickname: string;
  amount: number;
  hand?: {
    cards: Card[];
    category: HandCategory;
    description: string;
  };
}
