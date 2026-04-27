import type { Logger } from 'pino';
import type { ActionType, Card } from '@poker/shared';
import {
  applyAction,
  compareHands,
  createDeck,
  createHandState,
  cryptoRng,
  evaluateHand,
  legalActions,
  shuffle,
  calculateSidePots,
} from '@poker/engine';
import type { HandState } from '@poker/engine';
import type { RoomData, PlayerSession } from './roomManager.js';
import { saveHandHistory } from './persistence.js';

export type GameEventEmitter = (
  event: string,
  roomId: string,
  payload: unknown,
  targetSocketId?: string,
) => void;

export class GameLoop {
  private state: HandState | null = null;
  private turnTimer: ReturnType<typeof setTimeout> | null = null;
  private isPaused = false;
  private pausedRemainingMs = 0;
  private turnStartTime = 0;
  private emit: GameEventEmitter;
  private room: RoomData;
  private log: Logger;
  private processedActionIds = new Set<string>();

  constructor(room: RoomData, emit: GameEventEmitter, log: Logger) {
    this.room = room;
    this.emit = emit;
    this.log = log;
  }

  async startHand(): Promise<void> {
    const seated = [...this.room.players.values()]
      .filter(p => p.seatIndex >= 0 && p.chips > 0)
      .sort((a, b) => a.seatIndex - b.seatIndex);

    if (seated.length < 2) {
      this.log.warn({ roomId: this.room.roomId }, 'Not enough players to start hand');
      return;
    }

    this.room.handNumber += 1;
    const handNumber = this.room.handNumber;

    const dealerSeat = this.getDealerSeat(seated);
    const rng = cryptoRng();
    const deck = shuffle(createDeck(), rng);

    this.state = createHandState(
      handNumber,
      seated.map(p => ({ playerId: p.playerId, seatIndex: p.seatIndex, chips: p.chips })),
      deck,
      dealerSeat,
      this.room.config.smallBlind,
      this.room.config.bigBlind,
      Date.now(),
    );

    for (const p of this.state.players) {
      const session = this.room.players.get(p.playerId);
      if (session) session.chips = p.chips;
    }

    this.emit('game:start', this.room.roomId, {
      roomId: this.room.roomId,
      handNumber,
      dealerSeat,
      sbSeat: this.state.sbSeat,
      bbSeat: this.state.bbSeat,
    });

    for (const p of this.state.players) {
      const session = this.room.players.get(p.playerId);
      if (session?.socketId && p.holeCards) {
        this.emit('game:deal', this.room.roomId, {
          roomId: this.room.roomId,
          holeCards: p.holeCards,
        }, session.socketId);
      }
    }

    this.scheduleTurn();
  }

  private getDealerSeat(seated: PlayerSession[]): number {
    if (this.room.handNumber === 1) return seated[0]!.seatIndex;
    const prevDealer = this.state?.dealerSeat ?? seated[0]!.seatIndex;
    const idx = seated.findIndex(p => p.seatIndex === prevDealer);
    return seated[(idx + 1) % seated.length]!.seatIndex;
  }

  private scheduleTurn(): void {
    if (!this.state || this.state.isFinished) {
      void this.finishHand();
      return;
    }

    const current = this.state.players[this.state.currentPlayerIndex];
    if (!current) return;

    const session = this.room.players.get(current.playerId);
    if (!session) return;

    const legal = legalActions(this.state, current.playerId);
    const maxBet = Math.max(...this.state.players.map(p => p.currentStreetBet));
    const toCall = maxBet - current.currentStreetBet;

    const timeoutMs = this.room.config.timeoutSec * 1000;
    const timeoutAt = Date.now() + timeoutMs;
    this.turnStartTime = Date.now();

    this.emit('game:turn', this.room.roomId, {
      roomId: this.room.roomId,
      seatIndex: current.seatIndex,
      playerId: current.playerId,
      timeoutAt,
      legalActions: legal.map(a => a.type),
      minRaise: this.state.minRaise,
      callAmount: toCall,
    });

    this.turnTimer = setTimeout(() => {
      void this.handleTimeout(current.playerId);
    }, timeoutMs);
  }

  private async handleTimeout(playerId: string): Promise<void> {
    if (!this.state || this.isPaused) return;

    const session = this.room.players.get(playerId);
    if (!session) return;

    session.consecutiveTimeouts = (session.consecutiveTimeouts ?? 0) + 1;

    const legal = legalActions(this.state, playerId);
    const canCheck = legal.some(a => a.type === 'check');

    if (session.consecutiveTimeouts >= 2) {
      session.seatIndex = -1;
      this.log.info({ playerId, roomId: this.room.roomId }, 'Player auto sit-out after 2 timeouts');
      this.applyAndContinue(playerId, { type: 'fold' });
    } else {
      this.applyAndContinue(playerId, { type: canCheck ? 'check' : 'fold' });
    }
  }

  async handleAction(
    playerId: string,
    actionId: string,
    type: ActionType,
    amount?: number,
  ): Promise<{ ok: boolean; error?: string }> {
    if (!this.state) return { ok: false, error: 'NO_ACTIVE_HAND' };

    if (this.processedActionIds.has(actionId)) {
      return { ok: false, error: 'DUPLICATE_ACTION' };
    }

    const current = this.state.players[this.state.currentPlayerIndex];
    if (!current || current.playerId !== playerId) {
      return { ok: false, error: 'NOT_YOUR_TURN' };
    }

    const legal = legalActions(this.state, playerId);
    if (!legal.some(a => a.type === type)) {
      return { ok: false, error: 'ILLEGAL_ACTION' };
    }

    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }

    const session = this.room.players.get(playerId);
    if (session) session.consecutiveTimeouts = 0;

    this.processedActionIds.add(actionId);
    this.applyAndContinue(playerId, { type, amount });
    return { ok: true };
  }

  private applyAndContinue(playerId: string, action: { type: ActionType; amount?: number }): void {
    if (!this.state) return;

    try {
      const prevBoard = [...this.state.board];
      this.state = applyAction(this.state, playerId, action);

      const currentPlayer = this.state.players.find(p => p.playerId === playerId);
      const totalPot = this.state.pots.reduce((s, p) => s + p.amount, 0)
        + this.state.players.reduce((s, p) => s + p.currentStreetBet, 0);

      this.emit('game:action', this.room.roomId, {
        roomId: this.room.roomId,
        playerId,
        seatIndex: currentPlayer?.seatIndex ?? 0,
        type: action.type,
        amount: action.amount,
        chipsAfter: currentPlayer?.chips ?? 0,
        potTotal: totalPot,
      });

      if (this.state.board.length > prevBoard.length) {
        this.emit('room:update', this.room.roomId, {
          roomId: this.room.roomId,
          type: 'game_action',
          data: { board: this.state.board, street: this.state.street },
        });
      }

      for (const p of this.state.players) {
        const session = this.room.players.get(p.playerId);
        if (session) session.chips = p.chips;
      }

      if (this.state.isFinished) {
        void this.finishHand();
      } else {
        this.scheduleTurn();
      }
    } catch (e) {
      this.log.error({ err: e, playerId }, 'Error applying action');
    }
  }

  private async finishHand(): Promise<void> {
    if (!this.state) return;

    const state = this.state;

    const contributions = state.players.map(p => ({
      playerId: p.playerId,
      contributed: p.totalContributed,
      folded: p.status === 'folded',
    }));
    const pots = calculateSidePots(contributions);

    const nonFolded = state.players.filter(p => p.status !== 'folded');

    interface WinnerEntry { playerId: string; amount: number }
    const winners: WinnerEntry[] = [];

    const handResults = new Map<string, ReturnType<typeof evaluateHand>>();
    const showdownHands: Array<{
      playerId: string;
      seatIndex: number;
      holeCards: [Card, Card];
      bestFive: Card[];
      category: string;
      description: string;
    }> = [];

    if (nonFolded.length === 1) {
      const winner = nonFolded[0]!;
      const totalAmount = pots.reduce((s, p) => s + p.amount, 0);
      winners.push({ playerId: winner.playerId, amount: totalAmount });
    } else {
      for (const p of state.players) {
        if (!p.holeCards) continue;
        const allCards = [...p.holeCards, ...state.board];
        handResults.set(p.playerId, evaluateHand(allCards));
      }

      for (const pot of pots) {
        const eligible = pot.eligiblePlayerIds
          .map(id => ({ id, result: handResults.get(id) }))
          .filter((e): e is { id: string; result: ReturnType<typeof evaluateHand> } => e.result !== undefined);

        if (eligible.length === 0) continue;

        eligible.sort((a, b) => compareHands(b.result, a.result));
        const best = eligible[0]!.result;
        const potWinners = eligible.filter(e => compareHands(e.result, best) === 0);
        const share = Math.floor(pot.amount / potWinners.length);

        for (const w of potWinners) {
          const existing = winners.find(x => x.playerId === w.id);
          if (existing) {
            existing.amount += share;
          } else {
            winners.push({ playerId: w.id, amount: share });
          }
        }
      }

      for (const p of nonFolded) {
        if (!p.holeCards) continue;
        const result = handResults.get(p.playerId);
        if (!result) continue;
        showdownHands.push({
          playerId: p.playerId,
          seatIndex: p.seatIndex,
          holeCards: p.holeCards,
          bestFive: result.bestFive,
          category: result.category,
          description: result.description,
        });
      }

      if (showdownHands.length > 0) {
        this.emit('game:showdown', this.room.roomId, {
          roomId: this.room.roomId,
          hands: showdownHands,
          board: state.board,
        });
      }
    }

    for (const w of winners) {
      const session = this.room.players.get(w.playerId);
      if (session) session.chips += w.amount;
    }

    const winnerPayload = winners.map(w => {
      const session = this.room.players.get(w.playerId);
      const hand = handResults.get(w.playerId);
      return {
        playerId: w.playerId,
        nickname: session?.nickname ?? w.playerId,
        amount: w.amount,
        hand: hand
          ? {
              cards: hand.bestFive,
              category: hand.category,
              description: hand.description,
            }
          : undefined,
      };
    });

    this.emit('game:end', this.room.roomId, {
      roomId: this.room.roomId,
      winners: winnerPayload,
      handNumber: state.handNumber,
    });

    await saveHandHistory(this.room.roomId, state.handNumber, {
      players: state.players.map(p => ({
        playerId: p.playerId,
        seatIndex: p.seatIndex,
        holeCards: p.holeCards,
      })),
      actions: state.actions,
      board: state.board,
      winners,
      pots,
    });

    this.state = null;

    const seated = [...this.room.players.values()].filter(p => p.seatIndex >= 0 && p.chips > 0);
    if (seated.length >= 2) {
      setTimeout(() => { void this.startHand(); }, 3000);
    } else {
      this.log.info({ roomId: this.room.roomId }, 'Not enough players, ending game');
    }
  }

  pause(): void {
    if (this.isPaused) return;
    this.isPaused = true;
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
      this.pausedRemainingMs = this.room.config.timeoutSec * 1000 - (Date.now() - this.turnStartTime);
    }
  }

  resume(): void {
    if (!this.isPaused) return;
    this.isPaused = false;
    if (this.state && !this.state.isFinished && this.pausedRemainingMs > 0) {
      const current = this.state.players[this.state.currentPlayerIndex];
      if (current) {
        this.turnTimer = setTimeout(() => {
          void this.handleTimeout(current.playerId);
        }, this.pausedRemainingMs);
      }
    }
  }

  get currentState(): HandState | null {
    return this.state;
  }
}
