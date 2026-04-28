import type { Card, Street, ActionType } from './types'
import { calculateSidePots } from './sidepots'
import type { Pot } from './sidepots'

export interface PlayerHandState {
  playerId: string
  seatIndex: number
  chips: number
  currentStreetBet: number
  totalContributed: number
  status: 'active' | 'folded' | 'allin' | 'sitout'
  holeCards: [Card, Card] | null
}

export interface HandState {
  handNumber: number
  street: Street
  players: PlayerHandState[]
  board: Card[]
  deck: Card[]
  dealerSeat: number
  sbSeat: number
  bbSeat: number
  currentPlayerIndex: number
  lastRaiserIndex: number
  lastRaiseAmount: number
  minRaise: number
  bigBlind: number
  lastRaiserActedVoluntarily: boolean
  pots: Pot[]
  actions: ActionRecord[]
  isFinished: boolean
  startTime: number
}

export interface ActionRecord {
  playerId: string
  type: ActionType
  amount?: number
  street: Street
}

export interface GameAction {
  type: ActionType
  amount?: number
}

export interface LegalAction {
  type: ActionType
  minAmount?: number
  maxAmount?: number
}

const STREET_ORDER: Street[] = ['preflop', 'flop', 'turn', 'river', 'showdown']

function nextStreet(s: Street): Street {
  const idx = STREET_ORDER.indexOf(s)
  return STREET_ORDER[idx + 1] ?? 'showdown'
}

function activeNonAllIn(state: HandState): PlayerHandState[] {
  return state.players.filter(p => p.status === 'active')
}

function getMaxBet(state: HandState): number {
  return Math.max(...state.players.map(p => p.currentStreetBet))
}

export function legalActions(state: HandState, playerId: string): LegalAction[] {
  if (state.isFinished) return []
  const player = state.players[state.currentPlayerIndex]
  if (!player || player.playerId !== playerId) return []
  if (player.status !== 'active') return []

  const maxBet = getMaxBet(state)
  const toCall = maxBet - player.currentStreetBet
  const actions: LegalAction[] = []

  actions.push({ type: 'fold' })

  if (toCall === 0) {
    actions.push({ type: 'check' })
  } else {
    actions.push({ type: 'call', minAmount: Math.min(toCall, player.chips), maxAmount: Math.min(toCall, player.chips) })
  }

  const minRaiseTotal = maxBet + state.minRaise - player.currentStreetBet
  if (player.chips > toCall) {
    const minRaiseAmt = Math.min(minRaiseTotal, player.chips)
    if (minRaiseAmt < player.chips) {
      actions.push({ type: 'raise', minAmount: minRaiseAmt, maxAmount: player.chips })
    }
    actions.push({ type: 'allin', minAmount: player.chips, maxAmount: player.chips })
  } else if (player.chips === toCall) {
    actions.push({ type: 'allin', minAmount: player.chips, maxAmount: player.chips })
  }

  return actions
}

export function applyAction(state: HandState, playerId: string, action: GameAction): HandState {
  if (state.isFinished) throw new Error('Hand is finished')
  const playerIdx = state.currentPlayerIndex
  const player = state.players[playerIdx]
  if (!player || player.playerId !== playerId) throw new Error('Not your turn')
  if (player.status !== 'active') throw new Error('Player not active')

  const maxBet = getMaxBet(state)
  const toCall = maxBet - player.currentStreetBet

  const newPlayers = state.players.map(p => ({ ...p }))
  const newPlayer = newPlayers[playerIdx]!
  const newActions: ActionRecord[] = [...state.actions]

  switch (action.type) {
    case 'fold': {
      newPlayer.status = 'folded'
      newActions.push({ playerId, type: 'fold', street: state.street })
      return advanceTurn({ ...state, players: newPlayers, actions: newActions })
    }
    case 'check': {
      if (toCall !== 0) throw new Error('Cannot check, must call')
      newActions.push({ playerId, type: 'check', street: state.street })
      return advanceTurn({ ...state, players: newPlayers, actions: newActions })
    }
    case 'call': {
      const callAmount = Math.min(toCall, newPlayer.chips)
      newPlayer.chips -= callAmount
      newPlayer.currentStreetBet += callAmount
      newPlayer.totalContributed += callAmount
      if (newPlayer.chips === 0) newPlayer.status = 'allin'
      newActions.push({ playerId, type: 'call', amount: callAmount, street: state.street })
      return advanceTurn({ ...state, players: newPlayers, actions: newActions })
    }
    case 'raise': {
      if (action.amount === undefined) throw new Error('Raise amount required')
      const raiseTotal = action.amount
      const newTotalBet = player.currentStreetBet + raiseTotal
      const raiseIncrement = newTotalBet - maxBet
      if (raiseIncrement < state.minRaise) throw new Error(`Raise too small, min raise increment: ${state.minRaise}`)
      newPlayer.chips -= raiseTotal
      newPlayer.currentStreetBet += raiseTotal
      newPlayer.totalContributed += raiseTotal
      if (newPlayer.chips === 0) newPlayer.status = 'allin'
      newActions.push({ playerId, type: 'raise', amount: raiseTotal, street: state.street })
      return advanceTurn({
        ...state,
        players: newPlayers,
        lastRaiserIndex: playerIdx,
        lastRaiseAmount: raiseIncrement,
        minRaise: raiseIncrement,
        lastRaiserActedVoluntarily: true,
        actions: newActions,
      })
    }
    case 'allin': {
      const allInAmount = newPlayer.chips
      newPlayer.chips = 0
      newPlayer.currentStreetBet += allInAmount
      newPlayer.totalContributed += allInAmount
      newPlayer.status = 'allin'
      const newTotalBet = player.currentStreetBet + allInAmount
      newActions.push({ playerId, type: 'allin', amount: allInAmount, street: state.street })
      if (newTotalBet > maxBet) {
        const raiseIncrement = newTotalBet - maxBet
        if (raiseIncrement >= state.minRaise) {
          return advanceTurn({
            ...state,
            players: newPlayers,
            lastRaiserIndex: playerIdx,
            lastRaiseAmount: raiseIncrement,
            minRaise: raiseIncrement,
            lastRaiserActedVoluntarily: true,
            actions: newActions,
          })
        }
      }
      return advanceTurn({ ...state, players: newPlayers, actions: newActions })
    }
  }
}

function advanceTurn(state: HandState): HandState {
  const nonFolded = state.players.filter(p => p.status !== 'folded' && p.status !== 'sitout')
  if (nonFolded.length === 1) return collectPots({ ...state, isFinished: true })
  if (isStreetComplete(state)) return advanceStreet(state)
  const nextIdx = findNextActivePlayer(state)
  if (nextIdx === -1) return advanceStreet(state)
  return { ...state, currentPlayerIndex: nextIdx }
}

function isStreetComplete(state: HandState): boolean {
  const canAct = activeNonAllIn(state)
  if (canAct.length === 0) return true
  const maxBet = getMaxBet(state)
  const allMatchedOrAllin = state.players
    .filter(p => p.status !== 'folded' && p.status !== 'sitout')
    .every(p => p.status === 'allin' || p.currentStreetBet === maxBet)
  if (!allMatchedOrAllin) return false
  if (state.lastRaiserIndex < 0) return true
  const currentIdx = state.currentPlayerIndex
  if (!state.lastRaiserActedVoluntarily) {
    return currentIdx === state.lastRaiserIndex
  }
  const nextIdx = findNextActivePlayer(state)
  return nextIdx === state.lastRaiserIndex || nextIdx === -1
}

function findNextActivePlayer(state: HandState): number {
  const start = (state.currentPlayerIndex + 1) % state.players.length
  return findNextActivePlayerFrom(state, start - 1)
}

function findNextActivePlayerFrom(state: HandState, fromIdx: number): number {
  const n = state.players.length
  for (let i = 1; i <= n; i++) {
    const idx = (fromIdx + i) % n
    const p = state.players[idx]
    if (p && p.status === 'active') return idx
  }
  return -1
}

function advanceStreet(state: HandState): HandState {
  const nonFolded = state.players.filter(p => p.status !== 'folded')
  const updatedPlayers = state.players.map(p => ({ ...p, currentStreetBet: 0 }))
  const newPots = calculateSidePots(
    state.players.map(p => ({
      playerId: p.playerId,
      contributed: p.totalContributed,
      folded: p.status === 'folded',
    }))
  )

  if (nonFolded.length <= 1 || state.street === 'river') {
    return collectPots({ ...state, players: updatedPlayers, pots: newPots, isFinished: true })
  }

  const allAllin = nonFolded.every(p => p.status === 'allin')
  const newStreet = nextStreet(state.street)
  let newDeck = [...state.deck]
  let newBoard = [...state.board]

  if (newStreet === 'flop') {
    newBoard = [...newBoard, ...newDeck.splice(0, 3)]
  } else if (newStreet === 'turn' || newStreet === 'river') {
    const card = newDeck.shift()
    if (card) newBoard = [...newBoard, card]
  }

  if (allAllin && newStreet !== 'showdown') {
    return advanceStreet({
      ...state,
      players: updatedPlayers,
      pots: newPots,
      street: newStreet,
      board: newBoard,
      deck: newDeck,
      lastRaiserIndex: -1,
      lastRaiseAmount: 0,
      minRaise: state.bigBlind,
      lastRaiserActedVoluntarily: false,
    })
  }

  if (newStreet === 'showdown') {
    return collectPots({
      ...state,
      players: updatedPlayers,
      pots: newPots,
      street: 'showdown',
      board: newBoard,
      deck: newDeck,
      isFinished: true,
    })
  }

  const newCurrentIdx = findFirstActiveAfterDealer(updatedPlayers, state.dealerSeat)
  return {
    ...state,
    players: updatedPlayers,
    pots: newPots,
    street: newStreet,
    board: newBoard,
    deck: newDeck,
    currentPlayerIndex: newCurrentIdx,
    lastRaiserIndex: -1,
    lastRaiseAmount: 0,
    minRaise: state.bigBlind,
    lastRaiserActedVoluntarily: false,
  }
}

function findFirstActiveAfterDealer(players: PlayerHandState[], dealerSeat: number): number {
  const n = players.length
  for (let i = 1; i <= n; i++) {
    const idx = players.findIndex(p => p.seatIndex === (dealerSeat + i) % 9)
    if (idx >= 0 && players[idx]!.status === 'active') return idx
  }
  return players.findIndex(p => p.status === 'active')
}

function collectPots(state: HandState): HandState {
  return {
    ...state,
    isFinished: true,
    street: state.board.length >= 5 ? 'showdown' : state.street,
  }
}

export function createHandState(
  handNumber: number,
  players: Array<{ playerId: string; seatIndex: number; chips: number }>,
  deck: Card[],
  dealerSeat: number,
  smallBlind: number,
  bigBlind: number,
  startTime: number
): HandState {
  const seatedPlayers = [...players].sort((a, b) => a.seatIndex - b.seatIndex)
  const n = seatedPlayers.length
  const dealerIdx = seatedPlayers.findIndex(p => p.seatIndex === dealerSeat)
  const sbIdx = (dealerIdx + 1) % n
  const bbIdx = (dealerIdx + 2) % n
  const sbPlayer = seatedPlayers[sbIdx]!
  const bbPlayer = seatedPlayers[bbIdx]!

  const handPlayers: PlayerHandState[] = seatedPlayers.map(p => ({
    playerId: p.playerId,
    seatIndex: p.seatIndex,
    chips: p.chips,
    currentStreetBet: 0,
    totalContributed: 0,
    status: 'active',
    holeCards: null,
  }))

  const sbBet = Math.min(smallBlind, handPlayers[sbIdx]!.chips)
  handPlayers[sbIdx]!.chips -= sbBet
  handPlayers[sbIdx]!.currentStreetBet = sbBet
  handPlayers[sbIdx]!.totalContributed = sbBet
  if (handPlayers[sbIdx]!.chips === 0) handPlayers[sbIdx]!.status = 'allin'

  const bbBet = Math.min(bigBlind, handPlayers[bbIdx]!.chips)
  handPlayers[bbIdx]!.chips -= bbBet
  handPlayers[bbIdx]!.currentStreetBet = bbBet
  handPlayers[bbIdx]!.totalContributed = bbBet
  if (handPlayers[bbIdx]!.chips === 0) handPlayers[bbIdx]!.status = 'allin'

  let deckCopy = [...deck]
  for (const p of handPlayers) {
    const c1 = deckCopy.shift()
    const c2 = deckCopy.shift()
    if (c1 && c2) p.holeCards = [c1, c2]
  }

  const firstToAct = (bbIdx + 1) % n

  return {
    handNumber,
    street: 'preflop',
    players: handPlayers,
    board: [],
    deck: deckCopy,
    dealerSeat,
    sbSeat: sbPlayer.seatIndex,
    bbSeat: bbPlayer.seatIndex,
    currentPlayerIndex: firstToAct,
    lastRaiserIndex: bbIdx,
    lastRaiseAmount: bigBlind,
    minRaise: bigBlind,
    bigBlind,
    lastRaiserActedVoluntarily: false,
    pots: [],
    actions: [
      { playerId: sbPlayer.playerId, type: 'raise', amount: sbBet, street: 'preflop' },
      { playerId: bbPlayer.playerId, type: 'raise', amount: bbBet, street: 'preflop' },
    ],
    isFinished: false,
    startTime,
  }
}
