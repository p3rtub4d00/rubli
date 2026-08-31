import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ChatMessage, Conversation, Demand, Proposal, ServiceRating, User } from '@rubli/shared';
import { apiCreateDemand, apiListDemands } from '../api/client';

const KEYS = {
  user: '@rubli/user',
  users: '@rubli/users',
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
  const users = await readJson<User[]>(KEYS.users, []);
  const nextUsers = [user, ...users.filter((item) => item.id !== user.id)];
  await writeJson(KEYS.users, nextUsers);
}

export async function getUser(): Promise<User | null> { return readJson<User | null>(KEYS.user, null); }
export async function getUsers(): Promise<User[]> { return readJson<User[]>(KEYS.users, []); }
export async function saveUsers(users: User[]) { await writeJson(KEYS.users, users); }

export async function saveDemands(demands: Demand[]) {
  await archiveDemandRecords(demands);
  const active = demands.filter((item) => item.status !== 'completed' && item.status !== 'cancelled');
  await writeJson(KEYS.demands, active);

  try {
    // Persistencia compartilhada: o armazenamento local continua como cache/fallback.
    await Promise.all(active.map((demand) => apiCreateDemand(demand)));
  } catch {
    // Offline-first: falha de rede não impede o uso local.
  }
}

export async function getDemands(): Promise<Demand[]> {
  const localDemands = await readJson<Demand[]>(KEYS.demands, []);
  try {
    const remoteDemands = await apiListDemands();
    if (remoteDemands.length > 0 || localDemands.length === 0) {
      const activeRemote = remoteDemands.filter((item) => item.status !== 'completed' && item.status !== 'cancelled');
      await writeJson(KEYS.demands, activeRemote);
      await archiveDemandRecords(remoteDemands);
      return activeRemote;
    }
  } catch {
    // Sem API disponível, segue usando o cache local.
  }

  const closed = localDemands.filter((item) => item.status === 'completed' || item.status === 'cancelled');
  if (closed.length > 0) {
    await archiveDemandRecords(closed);
    await writeJson(KEYS.demands, localDemands.filter((item) => item.status !== 'completed' && item.status !== 'cancelled'));
  }
  return localDemands.filter((item) => item.status !== 'completed' && item.status !== 'cancelled');
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
    KEYS.users,
    KEYS.demands,
    KEYS.proposals,
    KEYS.conversations,
    KEYS.messages,
    KEYS.ratings,
    HISTORY_KEY,
    HISTORY_DATA_KEY,
  ]);
}
