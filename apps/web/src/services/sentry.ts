import * as Sentry from '@sentry/react-native';
import { Platform } from 'react-native';

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

let isInitialized = false;

/**
 * Inicialização global do Sentry no App Mobile / Expo SDK 58
 */
export function initMobileSentry() {
  if (isInitialized) return;

  if (!SENTRY_DSN) {
    console.info(
      'ℹ️ [Sentry Mobile] EXPO_PUBLIC_SENTRY_DSN não configurado. Monitoramento em modo silencioso.'
    );
  }

  Sentry.init({
    dsn: SENTRY_DSN || undefined,
    debug: false,
    environment: process.env.NODE_ENV || (__DEV__ ? 'development' : 'production'),
    tracesSampleRate: __DEV__ ? 1.0 : 0.2,
    enableAutoSessionTracking: true,
    sessionTrackingIntervalMillis: 30000,
    enableNative: Platform.OS !== 'web',
  });

  // Rastreamento explícito de unhandled rejections (promessas rejeitadas não tratadas)
  setupUnhandledRejectionTracking();

  isInitialized = true;
}

/**
 * Rastreia promessas rejeitadas não capturadas no ambiente mobile nativo e web
 */
function setupUnhandledRejectionTracking() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.addEventListener('unhandledrejection', (event) => {
      console.error('🚨 [Unhandled Rejection (Web)]:', event.reason);
      Sentry.captureException(event.reason || new Error('Unhandled Promise Rejection'), {
        tags: { unhandledType: 'promise_rejection', platform: 'web' },
      });
    });
  } else {
    // Tratamento para React Native / Hermes
    const globalObj = (typeof globalThis !== 'undefined' ? globalThis : {}) as any;
    if (globalObj?.Promise && typeof globalObj.Promise.onUnhandled === 'function') {
      const prevHandler = globalObj.Promise.onUnhandled;
      globalObj.Promise.onUnhandled = (id: any, rejection: any) => {
        console.error('🚨 [Unhandled Rejection (Mobile)]:', rejection);
        Sentry.captureException(rejection || new Error('Unhandled Promise Rejection'), {
          tags: { unhandledType: 'promise_rejection', platform: Platform.OS },
          extra: { promiseId: id },
        });
        if (typeof prevHandler === 'function') {
          prevHandler(id, rejection);
        }
      };
    }
  }
}

export interface SentryUserContext {
  id: string;
  email?: string | null;
  name?: string | null;
  role?: string | null;
  schoolId?: string | null;
}

/**
 * Vincula a identidade do usuário/aluno ao escopo de erros e rastreamento do Sentry
 */
export function setSentryUser(user: SentryUserContext | null) {
  if (!user || !user.id) {
    Sentry.setUser(null);
    return;
  }

  Sentry.setUser({
    id: user.id,
    email: user.email || undefined,
    username: user.name || undefined,
  });

  if (user.role) {
    Sentry.setTag('userRole', user.role);
  }
  if (user.schoolId) {
    Sentry.setTag('schoolId', user.schoolId);
  }
}

/**
 * Remove o vínculo de usuário do escopo do Sentry ao deslogar
 */
export function clearSentryUser() {
  Sentry.setUser(null);
  Sentry.setTag('userRole', 'ANONYMOUS');
}

export { Sentry };
