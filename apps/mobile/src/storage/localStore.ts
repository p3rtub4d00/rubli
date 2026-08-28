import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ChatMessage, Conversation, Demand, Proposal, User } from '@rubli/shared';

const KEYS = {
  user: '@rubli/user',
  demands: '@rubli/demands',
  proposals: '@rubli/proposals',
  conversations: '@rubli/conversations',
  messages: '@rubli/messages',
} as const;

async function readJson<T>(key: string, fallback: T): Promise<T> {
  const value = await AsyncStorage.getItem(key);
  return value ? (JSON.parse(value) as T) : fallback;
}

async function writeJson<T>(key: string, value: T) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export async function saveUser(user: User) { await writeJson(KEYS.user, user); }
export async function getUser(): Promise<User | null> { return readJson<User | null>(KEYS.user, null); }

export async function saveDemands(demands: Demand[]) { await writeJson(KEYS.demands, demands); }
export async function getDemands(): Promise<Demand[]> { return readJson<Demand[]>(KEYS.demands, []); }

export async function saveProposals(proposals: Proposal[]) { await writeJson(KEYS.proposals, proposals); }
export async function getProposals(): Promise<Proposal[]> { return readJson<Proposal[]>(KEYS.proposals, []); }

export async function saveConversations(conversations: Conversation[]) { await writeJson(KEYS.conversations, conversations); }
export async function getConversations(): Promise<Conversation[]> { return readJson<Conversation[]>(KEYS.conversations, []); }

export async function saveMessages(messages: ChatMessage[]) { await writeJson(KEYS.messages, messages); }
export async function getMessages(): Promise<ChatMessage[]> { return readJson<ChatMessage[]>(KEYS.messages, []); }

export async function clearLocalData() {
  await AsyncStorage.multiRemove([
    KEYS.user,
    KEYS.demands,
    KEYS.proposals,
    KEYS.conversations,
    KEYS.messages,
  ]);
}
