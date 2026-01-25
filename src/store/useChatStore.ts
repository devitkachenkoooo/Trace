import { create } from 'zustand';

interface UIState {
  activeChatId: string | null;
  isSidebarOpen: boolean;
  setActiveChatId: (id: string | null) => void;
  toggleSidebar: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  activeChatId: null,
  isSidebarOpen: true,
  setActiveChatId: (id) => set({ activeChatId: id }),
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
}));
