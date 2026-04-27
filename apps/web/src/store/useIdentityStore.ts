import { create } from 'zustand';
import { getDeviceId, getNickname, setNickname } from '../identity.ts';

interface IdentityState {
  deviceId: string;
  nickname: string;
  setNickname: (name: string) => void;
}

export const useIdentityStore = create<IdentityState>()((set) => ({
  deviceId: getDeviceId(),
  nickname: getNickname(),
  setNickname: (name) => {
    setNickname(name);
    set({ nickname: name });
  },
}));
