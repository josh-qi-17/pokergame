import type { ActionType, Card, ChatMessage, RoomConfig, RoomState, WinnerInfo } from './types.js';

export interface ClientToServerEvents {
  'room:create': (payload: RoomCreatePayload, cb: (res: RoomCreateResponse) => void) => void;
  'room:join': (payload: RoomJoinPayload, cb: (res: RoomJoinResponse) => void) => void;
  'room:sit': (payload: RoomSitPayload, cb: (res: AckResponse) => void) => void;
  'room:stand': (payload: { roomId: string }, cb: (res: AckResponse) => void) => void;
  'room:leave': (payload: { roomId: string }) => void;
  'game:action': (payload: GameActionPayload, cb: (res: AckResponse) => void) => void;
  'chat:send': (payload: ChatSendPayload) => void;
  'host:kick': (payload: HostKickPayload, cb: (res: AckResponse) => void) => void;
  'host:pause': (payload: { roomId: string }, cb: (res: AckResponse) => void) => void;
  'host:resume': (payload: { roomId: string }, cb: (res: AckResponse) => void) => void;
  'host:start': (payload: { roomId: string }, cb: (res: AckResponse) => void) => void;
}

export interface ServerToClientEvents {
  'room:state': (payload: RoomState) => void;
  'room:update': (payload: RoomUpdatePayload) => void;
  'game:start': (payload: GameStartPayload) => void;
  'game:deal': (payload: GameDealPayload) => void;
  'game:turn': (payload: GameTurnPayload) => void;
  'game:action': (payload: GameActionBroadcast) => void;
  'game:showdown': (payload: GameShowdownPayload) => void;
  'game:end': (payload: GameEndPayload) => void;
  'chat:message': (payload: ChatMessage) => void;
  error: (payload: ErrorPayload) => void;
}

export interface RoomCreatePayload {
  deviceId: string;
  nickname: string;
  config: RoomConfig;
}

export interface RoomCreateResponse {
  ok: boolean;
  roomId?: string;
  error?: string;
}

export interface RoomJoinPayload {
  deviceId: string;
  nickname: string;
  roomId: string;
}

export interface RoomJoinResponse {
  ok: boolean;
  playerId?: string;
  error?: string;
}

export interface RoomSitPayload {
  roomId: string;
  seatIndex: number;
}

export interface AckResponse {
  ok: boolean;
  error?: string;
}

export interface GameActionPayload {
  roomId: string;
  actionId: string;
  type: ActionType;
  amount?: number;
}

export interface ChatSendPayload {
  roomId: string;
  content: string;
  type: 'text' | 'emoji';
}

export interface HostKickPayload {
  roomId: string;
  targetPlayerId: string;
}

export interface RoomUpdatePayload {
  roomId: string;
  type: 'player_joined' | 'player_left' | 'player_sat' | 'player_stood' | 'game_started' | 'game_action' | 'chips_updated' | 'player_kicked' | 'paused' | 'resumed' | 'player_reconnected' | 'player_disconnected';
  data: unknown;
}

export interface GameStartPayload {
  roomId: string;
  handNumber: number;
  dealerSeat: number;
  sbSeat: number;
  bbSeat: number;
}

export interface GameDealPayload {
  roomId: string;
  holeCards: [Card, Card];
}

export interface GameTurnPayload {
  roomId: string;
  seatIndex: number;
  playerId: string;
  timeoutAt: number;
  legalActions: ActionType[];
  minRaise: number;
  callAmount: number;
}

export interface GameActionBroadcast {
  roomId: string;
  playerId: string;
  seatIndex: number;
  type: ActionType;
  amount?: number;
  chipsAfter: number;
  potTotal: number;
}

export interface GameShowdownPayload {
  roomId: string;
  hands: Array<{
    playerId: string;
    seatIndex: number;
    holeCards: [Card, Card];
    bestFive: Card[];
    category: string;
    description: string;
  }>;
  board: Card[];
}

export interface GameEndPayload {
  roomId: string;
  winners: WinnerInfo[];
  handNumber: number;
}

export interface ErrorPayload {
  code: string;
  message: string;
}

export type ErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'BANNED'
  | 'NOT_YOUR_TURN'
  | 'ILLEGAL_ACTION'
  | 'NOT_HOST'
  | 'GAME_IN_PROGRESS'
  | 'SEAT_TAKEN'
  | 'INVALID_PAYLOAD'
  | 'DUPLICATE_ACTION';
