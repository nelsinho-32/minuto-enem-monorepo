import Constants from 'expo-constants';
import { NativeModules, Platform } from 'react-native';

const API_PORT = 3333;

/**
 * Extrai o host (IP ou domínio) de uma URL ou string host:port
 */
function extractHost(candidate?: string | null): string | null {
  if (!candidate || typeof candidate !== 'string') return null;

  let clean = candidate.trim();
  if (clean.includes('://')) {
    clean = clean.split('://')[1];
  }
  clean = clean.split('/')[0];
  const host = clean.split(':')[0];

  if (!host || host === 'localhost' || host === '127.0.0.1') {
    return null;
  }

  // Se for um túnel do Expo/ngrok (ex: *.ngrok-free.app ou *.exp.direct),
  // esse domínio só atende a porta do Metro (8081), NÃO a porta 3333 da API!
  if (host.includes('ngrok') || host.includes('exp.direct') || host.includes('loca.lt')) {
    return null;
  }

  return host;
}

/**
 * Resolve a URL da API automaticamente:
 * 1. Se EXPO_PUBLIC_API_URL estiver definida (ex.: produção ou túnel), usa ela.
 * 2. Se estiver rodando no navegador (Web / Safari no iOS / Chrome no Android),
 *    usa o próprio hostname da página (ex.: 192.168.1.18) apontando para a porta 3333.
 * 3. Se estiver em dispositivo móvel físico (iOS no Expo Go ou Android),
 *    extrai o IP da máquina de desenvolvimento a partir do scriptURL do Metro ou do linkingUri.
 * 4. Fallbacks para emulador Android (10.0.2.2) ou simulador iOS/Desktop (localhost).
 */
function resolveBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl) return envUrl.replace(/\/+$/, '');

  // 1. Navegador Web (Safari no iPhone, Chrome no PC/Android, etc.)
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const webHost = window.location.hostname;
    if (webHost && webHost !== 'localhost' && webHost !== '127.0.0.1') {
      const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
      return `${protocol}//${webHost}:${API_PORT}`;
    }
  }

  // 2. Dispositivo Nativo (Expo Go / React Native no iOS ou Android)
  const scriptURL = NativeModules?.SourceCode?.scriptURL;
  const hostFromScript = extractHost(scriptURL);
  if (hostFromScript) {
    return `http://${hostFromScript}:${API_PORT}`;
  }

  // 3. LinkingUri ou ExperienceUrl (Expo Go)
  const hostFromLinking = extractHost(Constants.linkingUri) ?? extractHost(Constants.experienceUrl);
  if (hostFromLinking) {
    return `http://${hostFromLinking}:${API_PORT}`;
  }

  // 4. Configurações legadas ou manifest do Expo
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants as any).expoGoConfig?.debuggerHost ??
    (Constants as any).manifest2?.extra?.expoGo?.debuggerHost ??
    (Constants as any).manifest?.debuggerHost;
  const hostFromConfig = extractHost(hostUri);
  if (hostFromConfig) {
    return `http://${hostFromConfig}:${API_PORT}`;
  }

  // 5. Emulador Android
  if (Platform.OS === 'android') return `http://10.0.2.2:${API_PORT}`;

  // 6. Simulador / Desktop
  return `http://localhost:${API_PORT}`;
}

export const BASE_URL = resolveBaseUrl();
console.log('🌐 [Minuto ENEM] URL da API configurada para:', BASE_URL);

interface RequestOptions extends RequestInit {
  token?: string | null;
  timeoutMs?: number;
}

let authTokenProvider: (() => string | null) | null = null;

/**
 * Registra o provedor de token JWT vindo da store de autenticação.
 */
export function registerAuthTokenProvider(provider: () => string | null) {
  authTokenProvider = provider;
}

async function request<T = any>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { token, headers: customHeaders, timeoutMs = 15000, ...restOptions } = options;
  const resolvedToken = token !== undefined ? token : authTokenProvider?.();

  const normalizedEndpoint = endpoint.startsWith('/')
    ? endpoint
    : `/${endpoint}`;

  const isFormData =
    typeof FormData !== 'undefined' && restOptions.body instanceof FormData;

  const resolvedHeaders: Record<string, string> = {
    ...(resolvedToken ? { Authorization: `Bearer ${resolvedToken}` } : {}),
    ...((customHeaders as Record<string, string>) || {}),
  };

  if (!isFormData && !resolvedHeaders['Content-Type']) {
    resolvedHeaders['Content-Type'] = 'application/json';
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${BASE_URL}${normalizedEndpoint}`, {
      ...restOptions,
      headers: resolvedHeaders,
      signal: restOptions.signal || controller.signal,
    });
    clearTimeout(timeoutId);

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMessage =
        data?.error ||
        data?.message ||
        `Erro na requisição (${response.status})`;
      throw new Error(errorMessage);
    }

    return data as T;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(
        `Tempo limite esgotado (15s) ao conectar à API em ${BASE_URL}${normalizedEndpoint}. Verifique se a API está ligada e acessível.`
      );
    }
    throw err;
  }
}

export const api = {
  baseURL: BASE_URL,

  get: <T = any>(endpoint: string, options?: RequestOptions) =>
    request<T>(endpoint, { ...options, method: 'GET' }),

  post: <T = any>(endpoint: string, body?: unknown, options?: RequestOptions) => {
    const isFormData =
      typeof FormData !== 'undefined' && body instanceof FormData;

    return request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: isFormData
        ? (body as any)
        : body !== undefined
        ? JSON.stringify(body)
        : undefined,
    });
  },

  put: <T = any>(endpoint: string, body?: unknown, options?: RequestOptions) => {
    const isFormData =
      typeof FormData !== 'undefined' && body instanceof FormData;

    return request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: isFormData
        ? (body as any)
        : body !== undefined
        ? JSON.stringify(body)
        : undefined,
    });
  },

  patch: <T = any>(endpoint: string, body?: unknown, options?: RequestOptions) => {
    const isFormData =
      typeof FormData !== 'undefined' && body instanceof FormData;

    return request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: isFormData
        ? (body as any)
        : body !== undefined
        ? JSON.stringify(body)
        : undefined,
    });
  },

  upload: <T = any>(
    endpoint: string,
    formData: FormData,
    options?: RequestOptions
  ) =>
    request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: formData,
    }),

  uploadWithProgress: <T = any>(
    endpoint: string,
    formData: FormData,
    onProgress?: (percent: number) => void,
    options?: RequestOptions
  ): Promise<T> => {
    return new Promise((resolve, reject) => {
      const normalizedEndpoint = endpoint.startsWith('/')
        ? endpoint
        : `/${endpoint}`;
      const url = `${BASE_URL}${normalizedEndpoint}`;
      const resolvedToken =
        options?.token !== undefined ? options.token : authTokenProvider?.();

      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);

      if (resolvedToken) {
        xhr.setRequestHeader('Authorization', `Bearer ${resolvedToken}`);
      }

      if (xhr.upload && onProgress) {
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable && event.total > 0) {
            const percent = Math.round((event.loaded / event.total) * 100);
            onProgress(percent);
          }
        };
      }

      xhr.onload = () => {
        try {
          const response = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(response as T);
          } else {
            reject(
              new Error(
                response?.error ||
                  response?.message ||
                  `Erro no upload (${xhr.status})`
              )
            );
          }
        } catch {
          reject(
            new Error(`Erro ao interpretar resposta do servidor (${xhr.status})`)
          );
        }
      };

      xhr.onerror = () => {
        reject(new Error('Erro de conexão ao realizar o upload do arquivo.'));
      };

      xhr.send(formData);
    });
  },

  delete: <T = any>(endpoint: string, options?: RequestOptions) =>
    request<T>(endpoint, { ...options, method: 'DELETE' }),
};
