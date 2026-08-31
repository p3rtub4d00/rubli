import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Demand, Rating, User } from '@rubli/shared';

const RATINGS_KEY = '@rubli/ratings';
const HISTORY_KEY = '@rubli/history_demands';
const HISTORY_DATA_KEY = '@rubli/history_demand_data';

export async function updateStoredUser(user: User) {
  await AsyncStorage.setItem('@rubli/user', JSON.stringify(user));
}

export async function getRatings(): Promise<Rating[]> {
  const raw = await AsyncStorage.getItem(RATINGS_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw) as Rating[]; } catch { return []; }
}

export async function saveRating(rating: Rating) {
  const ratings = await getRatings();
  const next = [rating, ...ratings.filter((item) => !(item.demandId === rating.demandId && item.fromUserId === rating.fromUserId && item.toUserId === rating.toUserId))];
  await AsyncStorage.setItem(RATINGS_KEY, JSON.stringify(next));
  return next;
}

export function getUserRatingSummary(ratings: Rating[], userId: string) {
  const received = ratings.filter((item) => item.toUserId === userId);
  if (received.length === 0) return { average: 0, count: 0 };
  const total = received.reduce((sum, item) => sum + item.stars, 0);
  return { average: total / received.length, count: received.length };
}

export async function getHistoryDemandIds(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(HISTORY_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw) as string[]; } catch { return []; }
}

export async function getHistoryDemands(): Promise<Demand[]> {
  const raw = await AsyncStorage.getItem(HISTORY_DATA_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw) as Demand[]; } catch { return []; }
}

export async function archiveCompletedDemand(demand: Demand) {
  const [ids, history] = await Promise.all([getHistoryDemandIds(), getHistoryDemands()]);
  const nextIds = ids.includes(demand.id) ? ids : [demand.id, ...ids];
  const nextHistory = [demand, ...history.filter((item) => item.id !== demand.id)];
  await AsyncStorage.multiSet([
    [HISTORY_KEY, JSON.stringify(nextIds)],
    [HISTORY_DATA_KEY, JSON.stringify(nextHistory)],
  ]);

  const rawActive = await AsyncStorage.getItem('@rubli/demands');
  if (rawActive) {
    try {
      const active = JSON.parse(rawActive) as Demand[];
      await AsyncStorage.setItem('@rubli/demands', JSON.stringify(active.filter((item) => item.id !== demand.id)));
    } catch {
      // Keep archived record even if active storage is malformed.
    }
  }
}

export async function moveDemandToHistory(demandId: string) {
  const ids = await getHistoryDemandIds();
  if (!ids.includes(demandId)) await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify([demandId, ...ids]));
}
