import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Rating, User } from '@rubli/shared';

const RATINGS_KEY = '@rubli/ratings';
const HISTORY_KEY = '@rubli/history_demands';

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
  const next = [rating, ...ratings.filter((item) => item.id !== rating.id)];
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

export async function moveDemandToHistory(demandId: string) {
  const ids = await getHistoryDemandIds();
  if (!ids.includes(demandId)) await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify([demandId, ...ids]));
}
