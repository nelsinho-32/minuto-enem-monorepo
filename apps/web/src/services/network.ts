import * as Network from 'expo-network';
import { Platform } from 'react-native';

/**
 * Verifica se o dispositivo está conectado à internet usando expo-network
 */
export async function isDeviceOnline(): Promise<boolean> {
  try {
    const networkState = await Network.getNetworkStateAsync();

    // No mobile nativo: isConnected indica interface ativa e isInternetReachable valida rota de internet
    if (networkState.isConnected === false) return false;
    if (networkState.isInternetReachable === false) return false;

    return Boolean(networkState.isConnected);
  } catch (err) {
    // Fallback gracioso para navegador Web ou ambientes sem permissão nativa
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && 'onLine' in navigator) {
      return navigator.onLine;
    }
    return true;
  }
}

