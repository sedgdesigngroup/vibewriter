import { create } from 'zustand';
import type { User } from '@/types';

interface AuthStore {
  user: User | null;
  isLoggedIn: boolean;
  setUser: (user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  isLoggedIn: false,

  setUser: (user: User) => set({ user, isLoggedIn: true }),

  logout: () => set({ user: null, isLoggedIn: false }),
}));
