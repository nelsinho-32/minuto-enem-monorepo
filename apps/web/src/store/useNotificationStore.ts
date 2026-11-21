import { create } from 'zustand';

export interface RealtimeNotificationItem {
  id: string;
  type: 'ESSAY_GRADED' | 'NEW_TASK' | 'NEW_ANNOUNCEMENT' | 'NEW_MESSAGE' | 'SYSTEM';
  title: string;
  body: string;
  route?: string;
  routeParams?: Record<string, string>;
  createdAt: string;
  read?: boolean;
}

interface NotificationState {
  realtimeItems: RealtimeNotificationItem[];
  activeToast: RealtimeNotificationItem | null;
  pushNotification: (item: RealtimeNotificationItem) => void;
  dismissToast: () => void;
  markAllRead: () => void;
  clearAll: () => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  realtimeItems: [],
  activeToast: null,

  pushNotification: (item) =>
    set((state) => {
      const exists = state.realtimeItems.some((n) => n.id === item.id);
      if (exists) return state;
      const nextItem: RealtimeNotificationItem = { ...item, read: false };
      return {
        realtimeItems: [nextItem, ...state.realtimeItems].slice(0, 30),
        activeToast: nextItem,
      };
    }),

  dismissToast: () => set({ activeToast: null }),

  markAllRead: () =>
    set((state) => ({
      realtimeItems: state.realtimeItems.map((n) => ({ ...n, read: true })),
    })),

  clearAll: () => set({ realtimeItems: [], activeToast: null }),
}));
