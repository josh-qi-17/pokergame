import type { ActionType, Card, Street } from '@poker/shared';
import type { Pot } from './sidepots.js';
export interface PlayerHandState {
    playerId: string;
    seatIndex: number;
    chips: number;
    currentStreetBet: number;
    totalContributed: number;
    status: 'active' | 'folded' | 'allin' | 'sitout';
    holeCards: [Card, Card] | null;
}
export interface HandState {
    handNumber: number;
    street: Street;
    players: PlayerHandState[];
    board: Card[];
    deck: Card[];
    dealerSeat: number;
    sbSeat: number;
    bbSeat: number;
    currentPlayerIndex: number;
    lastRaiserIndex: number;
    lastRaiseAmount: number;
    minRaise: number;
    bigBlind: number;
    /** false = 大盲尚未主动行动（preflop option 场景）；true = 已有主动加注行为 */
    lastRaiserActedVoluntarily: boolean;
    pots: Pot[];
    actions: ActionRecord[];
    isFinished: boolean;
    startTime: number;
}
export interface ActionRecord {
    playerId: string;
    type: ActionType;
    amount?: number;
    street: Street;
}
export interface GameAction {
    type: ActionType;
    amount?: number;
}
export interface LegalAction {
    type: ActionType;
    minAmount?: number;
    maxAmount?: number;
}
export declare function legalActions(state: HandState, playerId: string): LegalAction[];
export declare function applyAction(state: HandState, playerId: string, action: GameAction): HandState;
export declare function createHandState(handNumber: number, players: Array<{
    playerId: string;
    seatIndex: number;
    chips: number;
}>, deck: Card[], dealerSeat: number, smallBlind: number, bigBlind: number, startTime: number): HandState;
//# sourceMappingURL=handState.d.ts.map