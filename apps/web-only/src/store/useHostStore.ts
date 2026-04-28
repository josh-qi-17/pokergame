import { create } from 'zustand'
import { nanoid } from 'nanoid'
import {
  createDeck,
  shuffle,
  cryptoRng,
  createHandState,
  applyAction,
  legalActions,
  evaluateHand,
} from '../engine'
import type { RoomConfig, WinnerInfo, Card } from '../engine/types'
import type { HandState } from '../engine/handState'
import type { GamePhase, RoomStatePayload, SeatView, SidePot } from '../peer/protocol'
import type { ActionType } from '../engine/types'

export interface SeatInfo {
  seatIndex: number
  playerId: string
  nickname: string
  peerId: string | null   // null = 宿主本人
  chips: number
  timeoutCount: number
  rebuyCount: number
}

export type HostPhase = 'idle' | 'waiting' | 'playing' | 'showdown_over'

interface HostState {
  isHost: boolean
  phase: HostPhase
  roomId: string
  config: RoomConfig
  seats: SeatInfo[]
  handState: HandState | null
  winners: WinnerInfo[] | null
  isPaused: boolean
  handNumber: number
  dealerSeat: number
  // 计时器
  timeoutAt: number | null
  timerRef: ReturnType<typeof setTimeout> | null
  // 行动去重
  processedActionIds: Set<string>
  // 宿主自己的 playerId
  myPlayerId: string
  myNickname: string

  // Actions
  createRoom: (nickname: string, config: RoomConfig) => void
  addPlayer: (peerId: string, nickname: string) => string | null  // returns playerId or null if full
  removePlayer: (peerId: string) => void
  startGame: () => void
  startNextHand: () => void
  applyPlayerAction: (playerId: string, actionType: ActionType, amount?: number, actionId?: string) => boolean
  pauseGame: () => void
  resumeGame: () => void
  kickPlayer: (peerId: string) => void
  rebuyPlayer: (playerId: string) => boolean
  getRoomStateFor: (peerId: string | null) => RoomStatePayload
  clearTimer: () => void
  scheduleTimeout: () => void
}

function computeWinners(handState: HandState, seats: SeatInfo[]): WinnerInfo[] {
  const { players, board, pots } = handState
  const nonFolded = players.filter(p => p.status !== 'folded' && p.holeCards)

  if (nonFolded.length === 0) return []

  // 如果只有一人未弃牌，直接赢得所有底池
  if (nonFolded.length === 1) {
    const winner = nonFolded[0]!
    const seat = seats.find(s => s.playerId === winner.playerId)
    const total = pots.reduce((sum, p) => sum + p.amount, 0)
    return [{
      playerId: winner.playerId,
      nickname: seat?.nickname ?? winner.playerId,
      amount: total,
    }]
  }

  // 评估所有未弃牌玩家的手牌
  const evaluations = nonFolded.map(p => {
    const allCards: Card[] = [...(p.holeCards ?? []), ...board]
    const result = allCards.length >= 5 ? evaluateHand(allCards) : null
    return { player: p, result }
  })

  // 按每个底池分配赢家
  const winnerMap = new Map<string, number>()  // playerId -> total winnings
  const showdownHands = new Map<string, { cards: Card[]; category: typeof evaluations[0]['result'] extends null ? never : NonNullable<typeof evaluations[0]['result']> }>()

  for (const ev of evaluations) {
    if (ev.result) showdownHands.set(ev.player.playerId, { cards: ev.result.bestFive, category: ev.result })
  }

  for (const pot of pots) {
    const eligible = evaluations.filter(e => pot.eligiblePlayerIds.includes(e.player.playerId))
    if (eligible.length === 0) continue

    let bestResult = eligible[0]!.result
      // Find best result among eligible
    for (const e of eligible) {
      if (!e.result) continue
      if (!bestResult || compareHandResultsLocal(e.result, bestResult) > 0) {
        bestResult = e.result
      }
    }

    // Filter to only those matching bestResult
    const finalWinners = eligible.filter(e => {
      if (!e.result || !bestResult) return false
      return compareHandResultsLocal(e.result, bestResult) === 0
    })

    const share = Math.floor(pot.amount / finalWinners.length)
    const remainder = pot.amount - share * finalWinners.length

    finalWinners.forEach((w, i) => {
      const pid = w.player.playerId
      winnerMap.set(pid, (winnerMap.get(pid) ?? 0) + share + (i === 0 ? remainder : 0))
    })
  }

  const result: WinnerInfo[] = []
  winnerMap.forEach((amount, playerId) => {
    const seat = seats.find(s => s.playerId === playerId)
    const hand = showdownHands.get(playerId)
    result.push({
      playerId,
      nickname: seat?.nickname ?? playerId,
      amount,
      hand: hand?.category
        ? {
            cards: hand.category.bestFive,
            category: hand.category.category,
            description: hand.category.description,
          }
        : undefined,
    })
  })

  return result
}

const HAND_CATEGORY_RANK: Record<string, number> = {
  highCard: 1, pair: 2, twoPair: 3, threeOfAKind: 4,
  straight: 5, flush: 6, fullHouse: 7, fourOfAKind: 8,
  straightFlush: 9, royalFlush: 10,
}

function compareHandResultsLocal(
  a: { category: string; tiebreakers: number[] },
  b: { category: string; tiebreakers: number[] }
): number {
  const ra = HAND_CATEGORY_RANK[a.category] ?? 0
  const rb = HAND_CATEGORY_RANK[b.category] ?? 0
  if (ra !== rb) return ra > rb ? 1 : -1
  for (let i = 0; i < Math.max(a.tiebreakers.length, b.tiebreakers.length); i++) {
    const ta = a.tiebreakers[i] ?? 0
    const tb = b.tiebreakers[i] ?? 0
    if (ta !== tb) return ta > tb ? 1 : -1
  }
  return 0
}

export const useHostStore = create<HostState>((set, get) => ({
  isHost: false,
  phase: 'idle',
  roomId: '',
  config: { seatsMax: 6, smallBlind: 10, bigBlind: 20, initialChips: 1000, maxRebuy: 2, timeoutSec: 30 },
  seats: [],
  handState: null,
  winners: null,
  isPaused: false,
  handNumber: 0,
  dealerSeat: 0,
  timeoutAt: null,
  timerRef: null,
  processedActionIds: new Set(),
  myPlayerId: '',
  myNickname: '',

  createRoom(nickname, config) {
    const myPlayerId = nanoid(8)
    const roomId = nanoid(6).toUpperCase()
    const hostSeat: SeatInfo = {
      seatIndex: 0,
      playerId: myPlayerId,
      nickname,
      peerId: null,
      chips: config.initialChips,
      timeoutCount: 0,
      rebuyCount: 0,
    }
    set({
      isHost: true,
      phase: 'waiting',
      roomId,
      config,
      seats: [hostSeat],
      handState: null,
      winners: null,
      isPaused: false,
      handNumber: 0,
      dealerSeat: 0,
      myPlayerId,
      myNickname: nickname,
      processedActionIds: new Set(),
    })
  },

  addPlayer(peerId, nickname) {
    const { config, seats } = get()
    if (seats.length >= config.seatsMax) return null
    const usedIndices = new Set(seats.map(s => s.seatIndex))
    let seatIndex = 0
    while (usedIndices.has(seatIndex)) seatIndex++
    const playerId = nanoid(8)
    const newSeat: SeatInfo = {
      seatIndex,
      playerId,
      nickname,
      peerId,
      chips: config.initialChips,
      timeoutCount: 0,
      rebuyCount: 0,
    }
    set(s => ({ seats: [...s.seats, newSeat] }))
    return playerId
  },

  removePlayer(peerId) {
    set(s => ({ seats: s.seats.filter(seat => seat.peerId !== peerId) }))
  },

  startGame() {
    const { seats, handNumber, config } = get()
    const activePlayers = seats.filter(s => s.chips > 0)
    if (activePlayers.length < 2) return

    const newHandNumber = handNumber + 1
    const deck = shuffle(createDeck(), cryptoRng())
    const dealerSeat = activePlayers[(newHandNumber - 1) % activePlayers.length]!.seatIndex
    const handState = createHandState(
      newHandNumber,
      activePlayers.map(s => ({ playerId: s.playerId, seatIndex: s.seatIndex, chips: s.chips })),
      deck,
      dealerSeat,
      config.smallBlind,
      config.bigBlind,
      Date.now()
    )

    const updatedSeats = seats.map(s => ({
      ...s,
      chips: handState.players.find(p => p.playerId === s.playerId)?.chips ?? s.chips,
      timeoutCount: 0,
    }))

    set({
      phase: 'playing',
      handState,
      handNumber: newHandNumber,
      dealerSeat,
      winners: null,
      seats: updatedSeats,
    })

    get().scheduleTimeout()
  },

  startNextHand() {
    const { seats, handNumber, config, winners } = get()

    // 应用赢家筹码
    if (winners) {
      const updatedSeats = seats.map(s => {
        const win = winners.find(w => w.playerId === s.playerId)
        return win ? { ...s, chips: s.chips + win.amount } : s
      })
      set({ seats: updatedSeats })
    }

    const freshSeats = get().seats
    const activePlayers = freshSeats.filter(s => s.chips > 0)
    if (activePlayers.length < 2) {
      set({ phase: 'waiting', handState: null, winners: null })
      return
    }

    const deck = shuffle(createDeck(), cryptoRng())
    const newHandNumber = handNumber + 1
    const dealerSeat = activePlayers[newHandNumber % activePlayers.length]!.seatIndex
    const handState = createHandState(
      newHandNumber,
      activePlayers.map(s => ({ playerId: s.playerId, seatIndex: s.seatIndex, chips: s.chips })),
      deck,
      dealerSeat,
      config.smallBlind,
      config.bigBlind,
      Date.now()
    )

    const updatedSeats = freshSeats.map(s => ({
      ...s,
      chips: handState.players.find(p => p.playerId === s.playerId)?.chips ?? s.chips,
      timeoutCount: 0,
    }))

    set({
      phase: 'playing',
      handState,
      handNumber: newHandNumber,
      dealerSeat,
      winners: null,
      seats: updatedSeats,
    })

    get().scheduleTimeout()
  },

  applyPlayerAction(playerId, actionType, amount, actionId) {
    const { handState, processedActionIds, seats } = get()
    if (!handState || handState.isFinished) return false

    if (actionId) {
      if (processedActionIds.has(actionId)) return false
      processedActionIds.add(actionId)
    }

    const currentPlayer = handState.players[handState.currentPlayerIndex]
    if (!currentPlayer || currentPlayer.playerId !== playerId) return false

    const legal = legalActions(handState, playerId)
    const legalTypes = legal.map(l => l.type)
    if (!legalTypes.includes(actionType)) return false

    try {
      get().clearTimer()
      const newHandState = applyAction(handState, playerId, { type: actionType, amount })

      if (newHandState.isFinished) {
        // 计算赢家，更新筹码
        const winners = computeWinners(newHandState, seats)
        // 将 handState 最终筹码同步到 seats（pot 已被扣走，winners 中记录赢得金额）
        const seatsAfterHand = seats.map(s => {
          const hp = newHandState.players.find(p => p.playerId === s.playerId)
          return hp ? { ...s, chips: hp.chips } : s
        })
        set({ handState: newHandState, phase: 'showdown_over', winners, seats: seatsAfterHand })
      } else {
        set({ handState: newHandState })
        get().scheduleTimeout()
      }
      return true
    } catch {
      return false
    }
  },

  scheduleTimeout() {
    const { config, handState, isPaused } = get()
    if (!handState || handState.isFinished || isPaused) return

    get().clearTimer()
    const timeoutMs = config.timeoutSec * 1000
    const timeoutAt = Date.now() + timeoutMs
    set({ timeoutAt })

    const timer = setTimeout(() => {
      const state = get()
      if (!state.handState || state.handState.isFinished || state.isPaused) return

      const currentPlayer = state.handState.players[state.handState.currentPlayerIndex]
      if (!currentPlayer) return

      const seat = state.seats.find(s => s.playerId === currentPlayer.playerId)
      if (!seat) return

      const newTimeoutCount = seat.timeoutCount + 1

      if (newTimeoutCount >= 2) {
        // 第2次超时：sit-out
        set(s => ({
          seats: s.seats.map(se =>
            se.playerId === currentPlayer.playerId ? { ...se, timeoutCount: newTimeoutCount } : se
          ),
        }))
        // fold 并标记 sitout
        const legal = legalActions(state.handState, currentPlayer.playerId)
        const canCheck = legal.some(l => l.type === 'check')
        get().applyPlayerAction(currentPlayer.playerId, canCheck ? 'check' : 'fold')
        // 标记为 sitout（后续手牌跳过）
        set(s => ({
          seats: s.seats.map(se =>
            se.playerId === currentPlayer.playerId ? { ...se, chips: 0, timeoutCount: 0 } : se
          ),
        }))
      } else {
        set(s => ({
          seats: s.seats.map(se =>
            se.playerId === currentPlayer.playerId ? { ...se, timeoutCount: newTimeoutCount } : se
          ),
        }))
        const legal = legalActions(state.handState, currentPlayer.playerId)
        const canCheck = legal.some(l => l.type === 'check')
        get().applyPlayerAction(currentPlayer.playerId, canCheck ? 'check' : 'fold')
      }
    }, timeoutMs)

    set({ timerRef: timer })
  },

  clearTimer() {
    const { timerRef } = get()
    if (timerRef) {
      clearTimeout(timerRef)
      set({ timerRef: null, timeoutAt: null })
    }
  },

  pauseGame() {
    get().clearTimer()
    set({ isPaused: true })
  },

  resumeGame() {
    set({ isPaused: false })
    get().scheduleTimeout()
  },

  kickPlayer(peerId) {
    set(s => ({ seats: s.seats.filter(seat => seat.peerId !== peerId) }))
  },

  rebuyPlayer(playerId) {
    const { config, seats } = get()
    const seat = seats.find(s => s.playerId === playerId)
    if (!seat) return false
    if (seat.rebuyCount >= config.maxRebuy) return false
    set(s => ({
      seats: s.seats.map(se =>
        se.playerId === playerId
          ? { ...se, chips: se.chips + config.initialChips, rebuyCount: se.rebuyCount + 1 }
          : se
      ),
    }))
    return true
  },

  getRoomStateFor(peerId) {
    const { roomId, config, seats, handState, winners, isPaused, phase, handNumber, dealerSeat, timeoutAt } = get()

    // 找到对应的 playerId
    const seat = peerId === null
      ? seats.find(s => s.peerId === null)
      : seats.find(s => s.peerId === peerId)
    const viewerPlayerId = seat?.playerId ?? null

    const gamePhase: GamePhase = (() => {
      if (phase === 'waiting') return 'waiting'
      if (phase === 'showdown_over') return 'showdown_over'
      if (!handState) return 'waiting'
      return handState.street as GamePhase
    })()

    const totalPot = handState
      ? handState.pots.reduce((s, p) => s + p.amount, 0) +
        handState.players.reduce((s, p) => s + p.currentStreetBet, 0)
      : 0

    const sidePots: SidePot[] = handState?.pots ?? []

    const seatViews: SeatView[] = seats.map(s => {
      const handPlayer = handState?.players.find(p => p.playerId === s.playerId)
      const isShowdown = phase === 'showdown_over' || handState?.street === 'showdown'

      // 摊牌时亮出：赢家 + 所有未弃牌玩家
      const revealCards =
        isShowdown &&
        handPlayer &&
        handPlayer.status !== 'folded' &&
        handPlayer.holeCards != null

      const holeCardsForSeat: [Card, Card] | undefined =
        revealCards && handPlayer?.holeCards ? handPlayer.holeCards : undefined

      return {
        seatIndex: s.seatIndex,
        playerId: s.playerId,
        nickname: s.nickname,
        chips: handPlayer ? handPlayer.chips : s.chips,
        currentBet: handPlayer?.currentStreetBet ?? 0,
        totalContributed: handPlayer?.totalContributed ?? 0,
        status: handPlayer
          ? (handPlayer.status as SeatView['status'])
          : s.chips === 0
          ? 'sitout'
          : 'active',
        isDealer: handState ? s.seatIndex === handState.dealerSeat : false,
        isSmallBlind: handState ? s.seatIndex === handState.sbSeat : false,
        isBigBlind: handState ? s.seatIndex === handState.bbSeat : false,
        timeoutCount: s.timeoutCount,
        rebuyCount: s.rebuyCount,
        holeCards: holeCardsForSeat,
      }
    })

    // 获取自己的手牌（仅当游戏进行中）
    let myHoleCards: [Card, Card] | null = null
    if (viewerPlayerId && handState) {
      const myHandPlayer = handState.players.find(p => p.playerId === viewerPlayerId)
      if (myHandPlayer?.holeCards) myHoleCards = myHandPlayer.holeCards
    }

    const currentSeatIndex =
      handState && !handState.isFinished
        ? handState.players[handState.currentPlayerIndex]?.seatIndex ?? null
        : null

    return {
      roomId,
      config,
      seats: seatViews,
      pot: totalPot,
      sidePots,
      board: handState?.board ?? [],
      phase: gamePhase,
      currentSeatIndex,
      timeoutAt: timeoutAt,
      holeCards: myHoleCards,
      winners: phase === 'showdown_over' ? winners : null,
      isPaused,
      handNumber,
      dealerSeat: handState?.dealerSeat ?? dealerSeat,
    }
  },
}))

