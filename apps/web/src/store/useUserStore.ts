import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { safeStorage } from '@/services/safeStorage';
import {
  type UserRole,
  type AuthUser,
  type DayStreakStatus,
  type WeekDayStreakItem,
} from '@minuto-enem/shared';
import { api, registerAuthTokenProvider, registerAccountDisabledHandler } from '@/services/api';
import { Alert, Platform } from 'react-native';
import { useClassroomStore } from './useClassroomStore';
import { setSentryUser, clearSentryUser } from '@/services/sentry';

export type {
  UserRole,
  AuthUser,
  DayStreakStatus,
  WeekDayStreakItem,
} from '@minuto-enem/shared';

interface UserState {
  // Controle de Hidratação do AsyncStorage
  hasHydrated: boolean;
  setHasHydrated: (state: boolean) => void;

  // Autenticação e Perfil
  token: string | null;
  user: AuthUser | null;
  setAuth: (token: string, user: AuthUser) => void;
  logout: () => void;

  // Dados de Gamificação e Ofensiva
  userId: string;
  xp: number;
  answeredQuestionsCount: number;
  incrementAnsweredQuestions: () => void;
  streak: number;
  currentStreak: number;
  longestStreak: number;
  lastStudyDate: string | null;
  iceFreezes: number;
  streakHistory: Record<string, 'COMPLETED' | 'FROZEN'>;
  avatar: string | null;
  avatarsByUser: Record<string, string>;
  targetCourse: string;
  targetInstitution: string;
  targetModality: string;
  targetScore: number;
  triHistory: Array<{
    score: number;
    label: string;
    date: string;
    accuracyPercent?: number | null;
  }>;
  bio: string;
  setAvatar: (url: string | null) => void;
  setProfileMeta: (meta: {
    targetCourse?: string;
    targetInstitution?: string;
    targetModality?: string;
    targetScore?: number;
    bio?: string;
  }) => void;
  appendTriHistoryPoint: (point: {
    score: number;
    label: string;
    accuracyPercent?: number | null;
  }) => void;
  addXp: (amount: number) => void;
  validateStreakOnLogin: () => Promise<void>;
  registerDailyPlay: () => Promise<void>;
  completeQuestionStreakUpdate: (apiStreak?: {
    currentStreak?: number;
    longestStreak?: number;
    iceFreezes?: number;
  }) => void;
  getWeekDays: () => WeekDayStreakItem[];

  // Preferência de Tema (Claro / Escuro / Sistema — padrão Claro opcional)
  themePreference: 'light' | 'dark' | 'system';
  setThemePreference: (pref: 'light' | 'dark' | 'system') => void;
  toggleDarkMode: () => void;

  // Sessão de Quiz Concluída
  lastQuizSession: {
    totalQuestions: number;
    correctAnswers: number;
    xpEarned: number;
    triScore?: number | null;
    answers: Array<{
      questionId: string;
      text: string;
      options: string[];
      selectedAnswer: number;
      correctAnswer: number;
      isCorrect: boolean;
      explanation?: string;
      timeSpentMs?: number;
    }>;
  } | null;
  setLastQuizSession: (session: any) => void;
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function diffDaysLocal(dateStrA: string, dateStrB: string): number {
  const [yA, mA, dA] = dateStrA.split('-').map(Number);
  const [yB, mB, dB] = dateStrB.split('-').map(Number);
  const utcA = Date.UTC(yA, mA - 1, dA);
  const utcB = Date.UTC(yB, mB - 1, dB);
  return Math.floor((utcA - utcB) / (1000 * 60 * 60 * 24));
}

function addDaysToDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return formatLocalDate(dt);
}

export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      hasHydrated: false,
      setHasHydrated: (state) => set({ hasHydrated: state }),

      token: null,
      user: null,

      setAuth: (token, user) => {
        setSentryUser(user);
        useClassroomStore.getState().setUserId(user.id);
        const savedAvatar = get().avatarsByUser?.[user.id] || get().avatar || null;
        const userMeta = user as AuthUser & {
          targetCourse?: string | null;
          targetInstitution?: string | null;
          targetModality?: string | null;
          targetScore?: number | null;
          triHistory?: Array<{
            score: number;
            label: string;
            date: string;
            accuracyPercent?: number | null;
          }>;
        };
        set({
          token,
          user,
          userId: user.id,
          xp: user.xp ?? get().xp ?? 0,
          currentStreak: user.currentStreak ?? get().currentStreak ?? 0,
          streak: user.currentStreak ?? get().streak ?? 0,
          longestStreak: user.longestStreak ?? get().longestStreak ?? 0,
          iceFreezes: user.iceFreezes ?? get().iceFreezes ?? 0,
          avatar: savedAvatar,
          ...(userMeta.targetCourse ? { targetCourse: userMeta.targetCourse } : {}),
          ...(userMeta.targetInstitution ? { targetInstitution: userMeta.targetInstitution } : {}),
          ...(userMeta.targetModality ? { targetModality: userMeta.targetModality } : {}),
          ...(typeof userMeta.targetScore === 'number' ? { targetScore: userMeta.targetScore } : {}),
          ...(Array.isArray(userMeta.triHistory) ? { triHistory: userMeta.triHistory } : {}),
        });
        useClassroomStore.getState().fetchClassrooms();
      },

      logout: () => {
        clearSentryUser();
        useClassroomStore.getState().clearClassrooms();
        set({
          token: null,
          user: null,
          userId: '',
          xp: 0,
          answeredQuestionsCount: 0,
          streak: 0,
          currentStreak: 0,
          longestStreak: 0,
          lastStudyDate: null,
          iceFreezes: 0,
          streakHistory: {},
          avatar: null,
        });
      },

      userId: '',
      xp: 0,
      answeredQuestionsCount: 0,
      incrementAnsweredQuestions: () =>
        set((state) => ({ answeredQuestionsCount: state.answeredQuestionsCount + 1 })),
      streak: 0,
      themePreference: 'light',
      setThemePreference: (pref) => set({ themePreference: pref }),
      toggleDarkMode: () =>
        set((state) => ({
          themePreference: state.themePreference === 'dark' ? 'light' : 'dark',
        })),
      lastQuizSession: null,
      setLastQuizSession: (session) => set({ lastQuizSession: session }),
      currentStreak: 0,
      longestStreak: 0,
      lastStudyDate: null,
      iceFreezes: 0,
      streakHistory: {},
      avatar: null,
      avatarsByUser: {},
      targetCourse: 'Medicina',
      targetInstitution: 'USP',
      targetModality: 'AC',
      targetScore: 836,
      triHistory: [],
      bio: 'Focado na aprovação no ENEM!',

      setAvatar: (url) =>
        set((state) => {
          const uid = state.user?.id || state.userId || 'default';
          const nextMap = { ...(state.avatarsByUser || {}) };
          if (url) {
            nextMap[uid] = url;
          } else {
            delete nextMap[uid];
          }
          return {
            avatar: url,
            avatarsByUser: nextMap,
          };
        }),

      setProfileMeta: (meta) =>
        set((state) => ({
          targetCourse: meta.targetCourse ?? state.targetCourse,
          targetInstitution: meta.targetInstitution ?? state.targetInstitution,
          targetModality: meta.targetModality ?? state.targetModality,
          targetScore: meta.targetScore ?? state.targetScore,
          bio: meta.bio ?? state.bio,
        })),

      appendTriHistoryPoint: (point) =>
        set((state) => ({
          triHistory: [
            ...(state.triHistory || []),
            {
              score: Math.round(point.score),
              label: point.label || 'Simulado',
              accuracyPercent: point.accuracyPercent ?? null,
              date: new Date().toISOString(),
            },
          ].slice(-20),
        })),

      addXp: (amount) => set((state) => ({ xp: state.xp + amount })),

      validateStreakOnLogin: async () => {
        const { userId } = get();

        try {
          const data = await api.get(`/streak/${userId}/week`);
          const historyMap: Record<string, 'COMPLETED' | 'FROZEN'> = {
            ...get().streakHistory,
          };
          if (Array.isArray(data.weekDays)) {
            data.weekDays.forEach((d: WeekDayStreakItem) => {
              if (d.status === 'COMPLETED' || d.status === 'FROZEN') {
                historyMap[d.date] = d.status;
              }
            });
          }
          set({
            streak: data.currentStreak,
            currentStreak: data.currentStreak,
            longestStreak: data.longestStreak,
            iceFreezes: data.iceFreezes,
            lastStudyDate: data.lastStudyDate
              ? String(data.lastStudyDate).split('T')[0]
              : null,
            streakHistory: historyMap,
          });
          return;
        } catch {
          // Fallback local caso a API não esteja rodando no momento
        }

        set((state) => {
          if (!state.lastStudyDate || state.currentStreak === 0) return state;

          const todayStr = formatLocalDate(new Date());
          const diff = diffDaysLocal(todayStr, state.lastStudyDate);

          if (diff <= 1) return state;

          const missedDays = diff - 1;

          if (state.iceFreezes >= missedDays) {
            const updatedHistory = { ...state.streakHistory };
            for (let i = 1; i <= missedDays; i++) {
              const frozenDateStr = addDaysToDateStr(state.lastStudyDate, i);
              if (!updatedHistory[frozenDateStr]) {
                updatedHistory[frozenDateStr] = 'FROZEN';
              }
            }
            const yesterdayStr = addDaysToDateStr(todayStr, -1);
            return {
              iceFreezes: state.iceFreezes - missedDays,
              lastStudyDate: yesterdayStr,
              streakHistory: updatedHistory,
            };
          }

          return {
            streak: 0,
            currentStreak: 0,
          };
        });
      },

      registerDailyPlay: async () => {
        const { userId, validateStreakOnLogin } = get();
        await validateStreakOnLogin();

        try {
          const data = await api.post('/streak/complete-lesson', { userId });
          const todayStr = formatLocalDate(new Date());
          set((state) => ({
            streak: data.streak.currentStreak,
            currentStreak: data.streak.currentStreak,
            longestStreak: data.streak.longestStreak,
            lastStudyDate: todayStr,
            iceFreezes: data.streak.iceFreezes,
            streakHistory: {
              ...state.streakHistory,
              [todayStr]: 'COMPLETED',
            },
          }));
          return;
        } catch {
          // Fallback local caso o backend esteja offline
        }

        set((state) => {
          const todayStr = formatLocalDate(new Date());

          if (state.streakHistory[todayStr] === 'COMPLETED') {
            return state;
          }

          const yesterdayStr = addDaysToDateStr(todayStr, -1);
          const isConsecutive =
            state.lastStudyDate === yesterdayStr ||
            state.streakHistory[yesterdayStr] === 'COMPLETED' ||
            state.streakHistory[yesterdayStr] === 'FROZEN';

          const newStreak = isConsecutive ? state.currentStreak + 1 : 1;
          const newLongest = Math.max(state.longestStreak, newStreak);

          return {
            streak: newStreak,
            currentStreak: newStreak,
            longestStreak: newLongest,
            lastStudyDate: todayStr,
            iceFreezes: 0,
            streakHistory: {
              ...state.streakHistory,
              [todayStr]: 'COMPLETED',
            },
          };
        });
      },

      completeQuestionStreakUpdate: (apiStreak) =>
        set((state) => {
          const todayStr = formatLocalDate(new Date());
          const nextStreak =
            apiStreak?.currentStreak !== undefined
              ? apiStreak.currentStreak
              : state.currentStreak + 1;
          const nextLongest = Math.max(
            state.longestStreak,
            apiStreak?.longestStreak ?? nextStreak
          );

          return {
            streak: nextStreak,
            currentStreak: nextStreak,
            longestStreak: nextLongest,
            iceFreezes: 0, // Zera os gelos na hora ao bater a meta com questão respondida
            lastStudyDate: todayStr,
            streakHistory: {
              ...state.streakHistory,
              [todayStr]: 'COMPLETED',
            },
          };
        }),

      getWeekDays: () => {
        const state = get();
        const today = new Date();
        const todayStr = formatLocalDate(today);
        const currentDayOfWeek = today.getDay();

        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - currentDayOfWeek);

        const labels = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

        return labels.map((label, index) => {
          const cellDate = new Date(startOfWeek);
          cellDate.setDate(startOfWeek.getDate() + index);
          const dateStr = formatLocalDate(cellDate);

          const isToday = dateStr === todayStr;
          const isFuture = diffDaysLocal(dateStr, todayStr) > 0;
          const recordedStatus = state.streakHistory[dateStr];

          let status: DayStreakStatus = 'EMPTY';
          if (recordedStatus === 'COMPLETED') {
            status = 'COMPLETED';
          } else if (recordedStatus === 'FROZEN') {
            status = 'FROZEN';
          } else if (isFuture) {
            status = 'FUTURE';
          }

          return {
            date: dateStr,
            label,
            status,
            isToday,
          };
        });
      },
    }),
    {
      name: '@minuto-enem:user-storage',
      storage: createJSONStorage(() => safeStorage),
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        userId: state.userId,
        xp: state.xp,
        answeredQuestionsCount: state.answeredQuestionsCount,
        streak: state.streak,
        currentStreak: state.currentStreak,
        longestStreak: state.longestStreak,
        lastStudyDate: state.lastStudyDate,
        iceFreezes: state.iceFreezes,
        streakHistory: state.streakHistory,
        avatar: state.avatar,
        avatarsByUser: state.avatarsByUser,
        targetCourse: state.targetCourse,
        targetInstitution: state.targetInstitution,
        targetModality: state.targetModality,
        targetScore: state.targetScore,
        triHistory: state.triHistory,
        bio: state.bio,
      }),
      onRehydrateStorage: () => (state) => {
        if (typeof window === 'undefined') return;
        state?.setHasHydrated(true);
        if (state?.user?.id) {
          setSentryUser(state.user);
          useClassroomStore.getState().setUserId(state.user.id);
          useClassroomStore.getState().fetchClassrooms();
        } else {
          clearSentryUser();
          useClassroomStore.getState().clearClassrooms();
        }
      },
    }
  )
);

// Conecta automaticamente o token JWT da store ao cliente centralizado api.ts
registerAuthTokenProvider(() => useUserStore.getState().token);

// Desloga automaticamente se a direção escolar desativar a conta (HTTP 403)
let accountDisabledAlerted = false;
registerAccountDisabledHandler((reason: string) => {
  const { token, logout } = useUserStore.getState();
  if (!token) return;
  logout();
  if (!accountDisabledAlerted) {
    accountDisabledAlerted = true;
    const msg = reason || 'Sua conta foi desativada pela direção escolar.';
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.alert(msg);
    } else {
      Alert.alert('Sessão encerrada', msg);
    }
    setTimeout(() => {
      accountDisabledAlerted = false;
    }, 3000);
  }
});
