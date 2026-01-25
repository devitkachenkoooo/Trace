import { create } from 'zustand';

interface PresenceState {
  onlineUsers: Set<string>;
  setOnlineUsers: (users: Set<string>) => void;
}

export const usePresenceStore = create<PresenceState>((set) => ({
  onlineUsers: new Set(),
  setOnlineUsers: (users) => set({ onlineUsers: users }),
}));
