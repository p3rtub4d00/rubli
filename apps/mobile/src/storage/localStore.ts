import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ChatMessage, Conversation, Demand, ServiceRating, User } from '@rubli/shared';

const KEYS = {
  user: '@rubli/user',
  demands: '@rubli/demands',
  proposals: '@rubli/proposals',
  conversations: '@rubli/conversations',
  messages: '@rubli/messages',
  ratings: '@rubli/ratings',
} as const;

const HISTORY_KEY = '@rubli/history_demands';
const HISTORY_DATA_KEY = '@rubli/history_demand_data';

async function readJson<T>(key: string, fallback: T): Promise<T> {
  const value = await AsyncStorage.getItem(key);
  return value ? (JSON.parse(value) as T) : fallback;
}

async function writeJson<T>(key: string, value: T) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

async function archiveDemandRecords(demands: Demand[]) {
  const closed = demands.filter((item) => item.status === 'completed' || item.status === 'cancelled');
  if (closed.length === 0) return;

  const [historyIds, historyData] = await Promise.all([
    readJson<string[]>(HISTORY_KEY, []),
    readJson<Demand[]>(HISTORY_DATA_KEY, []),
  ]);

  const merged = [
    ...closed,
    ...historyData.filter((item) => !closed.some((closedDemand) => closedDemand.id === item.id)),
  ];
  const ids = Array.from(new Set([...closed.map((item) => item.id), ...historyIds]));

  await AsyncStorage.multiSet([
    [HISTORY_KEY, JSON.stringify(ids)],
    [HISTORY_DATA_KEY, JSON.stringify(merged)],
  ]);
}

export async function saveUser(user: User | null) {
  if (!user) {
    await AsyncStorage.removeItem(KEYS.user);
    return;
  }
  await writeJson(KEYS.user, user);
}

export async function getUser(): Promise<User | null> { return readJson<User | null>(KEYS.user, null); }

export async function saveDemands(demands: Demand[]) {
  await archiveDemandRecords(demands);
  const active = demands.filter((item) => item.status !== 'completed' && item.status !== 'cancelled');
  await writeJson(KEYS.demands, active);
}

export async function getDemands(): Promise<Demand[]> {
  const demands = await readJson<Demand[]>(KEYS.demands, []);
  const closed = demands.filter((item) => item.status === 'completed' || item.status === 'cancelled');
  if (closed.length > 0) {
    await archiveDemandRecords(closed);
    await writeJson(KEYS.demands, demands.filter((item) => item.status !== 'completed' && item.status !== 'cancelled'));
  }
  return demands.filter((item) => item.status !== 'completed' && item.status !== 'cancelled');
}

export async function saveProposals(proposals: Proposal[]) { await writeJson(KEYS.proposals, proposals); }
export async function getProposals(): Promise<Proposal[]> { return readJson<Proposal[]>(KEYS.proposals, []); }

export async function saveConversations(conversations: Conversation[]) { await writeJson(KEYS.conversations, conversations); }
export async function getConversations(): Promise<Conversation[]> { return readJson<Conversation[]>(KEYS.conversations, []); }

export async function saveMessages(messages: ChatMessage[]) { await writeJson(KEYS.messages, messages); }
export async function getMessages(): Promise<ChatMessage[]> { return readJson<ChatMessage[]>(KEYS.messages, []); }

export async function saveRatings(ratings: ServiceRating[]) { await writeJson(KEYS.ratings, ratings); }
export async function getRatings(): Promise<ServiceRating[]> { return readJson<ServiceRating[]>(KEYS.ratings, []); }

export async function clearLocalData() {
  await AsyncStorage.multiRemove([
    KEYS.user,
    KEYS.demands,
    KEYS.proposals,
    KEYS.conversations,
    KEYS.messages,
    KEYS.ratings,
    HISTORY_KEY,
    HISTORY_DATA_KEY,
  ]);
}
