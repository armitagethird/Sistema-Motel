import { create } from 'zustand';
import { Profile, Suite, Shift, ConnStatus } from '../types';

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'up_to_date'; currentVersion: string; checkedAt: string }
  | { state: 'available'; version: string; notes?: string; checkedAt: string }
  | { state: 'downloading'; version: string; downloaded: number; total: number }
  | { state: 'installing'; version: string }
  | { state: 'error'; error: string; checkedAt: string };

interface AppState {
  profile: Profile | null;
  suites: Suite[];
  currentShift: Shift | null;
  connStatus: ConnStatus;
  updateStatus: UpdateStatus;
  setProfile: (p: Profile | null) => void;
  setSuites: (s: Suite[]) => void;
  updateSuiteStatus: (id: string, status: Suite['status']) => void;
  setCurrentShift: (s: Shift | null) => void;
  setConnStatus: (s: ConnStatus) => void;
  setUpdateStatus: (s: UpdateStatus) => void;
}

export const useAppStore = create<AppState>((set) => ({
  profile: null,
  suites: [],
  currentShift: null,
  connStatus: 'online',
  updateStatus: { state: 'idle' },
  setProfile: (profile) => set({ profile }),
  setSuites: (suites) => set({ suites }),
  updateSuiteStatus: (id, status) =>
    set((state) => ({
      suites: state.suites.map((s) => (s.id === id ? { ...s, status } : s)),
    })),
  setCurrentShift: (currentShift) => set({ currentShift }),
  setConnStatus: (connStatus) => set({ connStatus }),
  setUpdateStatus: (updateStatus) => set({ updateStatus }),
}));
