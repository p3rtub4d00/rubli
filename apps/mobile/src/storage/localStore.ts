import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Demand, User } from '@rubli/shared';

const KEYS = {
  user: '@rubli/user',
  demands: '@rubli/demands',
} as const;

export async function saveUser(user: User) {
  await AsyncStorage.setItem(KEYS.user, JSON.stringify(user));
}

export async function getUser(): Promise<User | null> {
  const value = await AsyncStorage.getItem(KEYS.user);
  return value ? (JSON.parse(value) as User) : null;
}

export async function saveDemands(demands: Demand[]) {
  await AsyncStorage.setItem(KEYS.demands, JSON.stringify(demands));
}

export async function getDemands(): Promise<Demand[]> {
  const value = await AsyncStorage.getItem(KEYS.demands);
  return value ? (JSON.parse(value) as Demand[]) : [];
}

export async function clearLocalData() {
  await AsyncStorage.multiRemove([KEYS.user, KEYS.demands]);
}
