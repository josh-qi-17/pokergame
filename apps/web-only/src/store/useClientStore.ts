import { create } from 'zustand'
import type { RoomStatePayload } from '../peer/protocol'

interface ClientState {
  connected: boolean
  myPlayerId: string | null
  myNickname: string
  roomState: RoomStatePayload | null
  connectionStatus: 'idle' | 'connecting' | 'connected' | 'error' | 'disconnected'
  errorMessage: string | null

  setConnected: (playerId: string, nickname: string) => void
  setRoomState: (state: RoomStatePayload) => void
  setConnectionStatus: (status: ClientState['connectionStatus'], error?: string) => void
  disconnect: () => void
}

export const useClientStore = create<ClientState>(set => ({
  connected: false,
  myPlayerId: null,
  myNickname: '',
  roomState: null,
  connectionStatus: 'idle',
  errorMessage: null,

  setConnected(playerId, nickname) {
    set({ connected: true, myPlayerId: playerId, myNickname: nickname, connectionStatus: 'connected' })
  },

  setRoomState(state) {
    set({ roomState: state })
  },

  setConnectionStatus(status, error) {
    set({ connectionStatus: status, errorMessage: error ?? null })
    if (status === 'connected') set({ connected: true })
    if (status === 'disconnected' || status === 'error') set({ connected: false })
  },

  disconnect() {
    set({
      connected: false,
      myPlayerId: null,
      roomState: null,
      connectionStatus: 'disconnected',
      errorMessage: null,
    })
  },
}))
