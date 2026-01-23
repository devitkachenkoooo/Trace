import { create } from 'zustand';

interface User {
  id: string;
  email: string;
  name: string;
  avatar: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  loginWithGoogle: () => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  loginWithGoogle: () =>
    set({
      isAuthenticated: true,
      user: {
        id: 'u1',
        email: 'user@example.com',
        name: 'Demo User',
        avatar: 'https://i.pravatar.cc/150?u=u1',
      },
    }),
  logout: () => set({ isAuthenticated: false, user: null }),
}));
