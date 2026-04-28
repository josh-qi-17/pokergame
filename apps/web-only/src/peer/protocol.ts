import type { Card, RoomConfig, ActionType, WinnerInfo } from '../engine/types'

// Phase: waiting = 等待阶段；playing = 游戏中；showdown_over = 摊牌结算完成等待下一手
export type GamePhase = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'showdown_over'

export interface SeatView {
  seatIndex: number
  playerId: string
  nickname: string
  chips: number
  currentBet: number
  totalContributed: number
  status: 'active' | 'folded' | 'allin' | 'sitout' | 'empty'
  isDealer: boolean
  isSmallBlind: boolean
  isBigBlind: boolean
  timeoutCount: number
  rebuyCount: number
  // 仅摊牌时才有值（非自己的牌由宿主在 showdown 后统一下发）
  holeCards?: [Card, Card]
  bestFiveIndices?: number[] // bestFive 中的牌在 holeCards+board 中的索引（高亮用）
}

export interface SidePot {
  amount: number
  eligiblePlayerIds: string[]
}

export interface RoomStatePayload {
  roomId: string
  config: RoomConfig
  seats: SeatView[]
  pot: number
  sidePots: SidePot[]
  board: Card[]
  phase: GamePhase
  currentSeatIndex: number | null
  timeoutAt: number | null
  holeCards: [Card, Card] | null
  winners: WinnerInfo[] | null
  isPaused: boolean
  handNumber: number
  dealerSeat: number | null
}

// ===== 宿主 → 客户端 =====
export type HostToClient =
  | { type: 'room:state'; payload: RoomStatePayload }
  | { type: 'room:error'; payload: { code: string; message: string } }
  | { type: 'host:kick'; payload: { reason: string } }

// ===== 客户端 → 宿主 =====
export type ClientToHost =
  | { type: 'player:join'; payload: { nickname: string } }
  | { type: 'player:ready' }
  | {
      type: 'game:action'
      payload: {
        actionId: string
        action: ActionType
        amount?: number
      }
    }
