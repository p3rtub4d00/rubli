import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export type AuthTokens = { accessToken: string; refreshToken: string; accessTokenExpiresAt?: number };

const KEY = '@rubli/auth-tokens';

// Expo Go e novas builds possuem o módulo nativo. Uma APK de desenvolvimento
// criada antes desta dependência não o possui; nesse caso mantemos a sessão em
// AsyncStorage até ela ser atualizada, em vez de derrubar o aplicativo inteiro.
let secureStore: typeof import('expo-secure-store') | null = null;
if (Platform.OS !== 'web') {
  try { secureStore = require('expo-secure-store') as typeof import('expo-secure-store'); }
  catch { secureStore = null; }
}

export async function getAuthTokens(): Promise<AuthTokens | null> {
  const value = !secureStore
    ? await AsyncStorage.getItem(KEY)
    : await secureStore.getItemAsync(KEY);
  if (!value) return null;
  try {
    const tokens = JSON.parse(value) as AuthTokens;
    return tokens.accessToken && tokens.refreshToken ? tokens : null;
  } catch { return null; }
}

export async function saveAuthTokens(tokens: AuthTokens) {
  const value = JSON.stringify(tokens);
  if (!secureStore) await AsyncStorage.setItem(KEY, value);
  else await secureStore.setItemAsync(KEY, value, { keychainAccessible: secureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
}

export async function clearAuthTokens() {
  if (!secureStore) await AsyncStorage.removeItem(KEY);
  else await secureStore.deleteItemAsync(KEY);
}
