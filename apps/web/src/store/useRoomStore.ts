import { create } from 'zustand';
import type {
  Card,
  ChatMessage,
  GameTurnPayload,
  GameShowdownPayload,
  GameEndPayload,
  RoomState,
  WinnerInfo,
} from '@poker/shared';

interface ShowdownHand {
  playerId: string;
  seatIndex: number;
  holeCards: [Card, Card];
  bestFive: Card[];
  category: string;
  description: string;
}

interface RoomStoreState {
  roomState: RoomState | null;
  myPlayerId: string | null;
  myHoleCards: [Card, Card] | null;
  currentTurn: GameTurnPayload | null;
  showdownHands: ShowdownHand[];
  lastWinners: WinnerInfo[];
  board: Card[];
  isPaused: boolean;
  chat: ChatMessage[];
  isConnected: boolean;

  setRoomState: (state: RoomState) => void;
  setMyPlayerId: (id: string) => void;
  setMyHoleCards: (cards: [Card, Card]) => void;
  setCurrentTurn: (turn: GameTurnPayload | null) => void;
  setShowdown: (payload: GameShowdownPayload) => void;
  setGameEnd: (payload: GameEndPayload) => void;
  addChatMessage: (msg: ChatMessage) => void;
  setBoard: (board: Card[]) => void;
  setPaused: (paused: boolean) => void;
  setConnected: (connected: boolean) => void;
  updatePlayerChips: (playerId: string, chips: number) => void;
  applyRoomUpdate: (type: string, data: unknown) => void;
  reset: () => void;
}

export const useRoomStore = create<RoomStoreState>()((set) => ({
  roomState: null,
  myPlayerId: null,
  myHoleCards: null,
  currentTurn: null,
  showdownHands: [],
  lastWinners: [],
  board: [],
  isPaused: false,
  chat: [],
  isConnected: true,

  setRoomState: (state) => set({ roomState: state, board: state.game?.board ?? [] }),
  setMyPlayerId: (id) => set({ myPlayerId: id }),
  setMyHoleCards: (cards) => set({ myHoleCards: cards }),
  setCurrentTurn: (turn) => set({ currentTurn: turn }),
  setShowdown: (payload) => set({ showdownHands: payload.hands, board: payload.board }),
  setGameEnd: (payload) => set({
    lastWinners: payload.winners,
    currentTurn: null,
    myHoleCards: null,
    showdownHands: [],
  }),
  addChatMessage: (msg) => set(s => ({ chat: [...s.chat.slice(-100), msg] })),
  setBoard: (board) => set({ board }),
  setPaused: (paused) => set({ isPaused: paused }),
  setConnected: (connected) => set({ isConnected: connected }),
  updatePlayerChips: (playerId, chips) => set(state => {
    if (!state.roomState) return state;
    return {
      roomState: {
        ...state.roomState,
        players: state.roomState.players.map(p =>
          p.playerId === playerId ? { ...p, chips } : p
        ),
      },
    };
  }),
  applyRoomUpdate: (type, data) => set(state => {
    if (!state.roomState) return state;

    switch (type) {
      case 'paused':
        return { isPaused: true };
      case 'resumed':
        return { isPaused: false };
      case 'game_action': {
        const d = data as { board?: Card[]; street?: string };
        if (d.board) return { board: d.board };
        return state;
      }
      case 'player_disconnected': {
        const d = data as { playerId: string };
        return {
          roomState: {
            ...state.roomState,
            players: state.roomState.players.map(p =>
              p.playerId === d.playerId ? { ...p, isConnected: false } : p
            ),
          },
        };
      }
      case 'player_reconnected': {
        const d = data as { playerId: string };
        return {
          roomState: {
            ...state.roomState,
            players: state.roomState.players.map(p =>
              p.playerId === d.playerId ? { ...p, isConnected: true } : p
            ),
          },
        };
      }
      case 'game_started':
        return {
          roomState: { ...state.roomState, phase: 'playing' as const },
          lastWinners: [],
        };
      default:
        return state;
    }
  }),
  reset: () => set({
    roomState: null,
    myPlayerId: null,
    myHoleCards: null,
    currentTurn: null,
    showdownHands: [],
    lastWinners: [],
    board: [],
    isPaused: false,
    chat: [],
  }),
}));
