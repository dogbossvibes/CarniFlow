import { create } from 'zustand';

interface SyncState {
  isOnline:        boolean;
  isSyncing:       boolean;
  lastSyncAt:      number | null;
  pendingCount:    number;
  failedCount:     number;
  conflictCount:   number;
  syncProgress:    number;        // 0..1
  currentSyncItem: string | null;
  lastError:       string | null;

  setOnlineStatus:  (on: boolean) => void;
  setSyncing:       (on: boolean) => void;
  setPendingCount:  (n: number) => void;
  setFailedCount:   (n: number) => void;
  setConflictCount: (n: number) => void;
  setSyncProgress:  (p: number) => void;
  setCurrentSyncItem: (s: string | null) => void;
  setLastSyncAt:    (t: number) => void;
  setLastError:     (e: string | null) => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  isOnline:        true,
  isSyncing:       false,
  lastSyncAt:      null,
  pendingCount:    0,
  failedCount:     0,
  conflictCount:   0,
  syncProgress:    0,
  currentSyncItem: null,
  lastError:       null,

  setOnlineStatus:  (on) => set({ isOnline: on }),
  setSyncing:       (on) => set({ isSyncing: on, syncProgress: on ? 0 : 1, currentSyncItem: on ? undefined as any : null }),
  setPendingCount:  (n) => set({ pendingCount: n }),
  setFailedCount:   (n) => set({ failedCount: n }),
  setConflictCount: (n) => set({ conflictCount: n }),
  setSyncProgress:  (p) => set({ syncProgress: p }),
  setCurrentSyncItem: (s) => set({ currentSyncItem: s }),
  setLastSyncAt:    (t) => set({ lastSyncAt: t }),
  setLastError:     (e) => set({ lastError: e }),
}));
