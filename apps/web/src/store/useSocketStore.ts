import { create } from 'zustand';
import { connectSocket, getSocket } from '../socket.ts';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

interface SocketState {
  status: ConnectionStatus;
  connect: () => void;
}

export const useSocketStore = create<SocketState>()((set) => {
  const socket = getSocket();

  socket.on('connect', () => set({ status: 'connected' }));
  socket.on('disconnect', () => set({ status: 'disconnected' }));
  socket.on('connect_error', () => set({ status: 'disconnected' }));

  return {
    status: 'disconnected',
    connect: () => {
      if (socket.connected) {
        set({ status: 'connected' });
        return;
      }
      set({ status: 'connecting' });
      connectSocket();
    },
  };
});
