import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type { StateStorage } from 'zustand/middleware';

const isServer = Platform.OS === 'web' && typeof window === 'undefined';
const memoryStore: Record<string, string> = {};

/**
 * Storage adapter seguro para SSR (Node.js) e Client (Web / iOS / Android).
 *
 * No servidor (Node.js / Expo Router Server):
 * Evita o erro "ReferenceError: window is not defined" provocado pelo AsyncStorage no ambiente Web.
 *
 * No cliente (Navegador ou Nativo):
 * Utiliza o AsyncStorage completo para persistência permanente no dispositivo.
 */
export const safeStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    if (isServer) {
      return memoryStore[name] ?? null;
    }
    try {
      return await AsyncStorage.getItem(name);
    } catch {
      return memoryStore[name] ?? null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    if (isServer) {
      memoryStore[name] = value;
      return;
    }
    try {
      await AsyncStorage.setItem(name, value);
    } catch {
      memoryStore[name] = value;
    }
  },
  removeItem: async (name: string): Promise<void> => {
    if (isServer) {
      delete memoryStore[name];
      return;
    }
    try {
      await AsyncStorage.removeItem(name);
    } catch {
      delete memoryStore[name];
    }
  },
};

export const safeAsyncStorage = {
  getItem: async (key: string): Promise<string | null> => {
    return (await safeStorage.getItem(key)) ?? null;
  },
  setItem: async (key: string, value: string): Promise<void> => {
    await safeStorage.setItem(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    await safeStorage.removeItem(key);
  },
};

export default safeStorage;
