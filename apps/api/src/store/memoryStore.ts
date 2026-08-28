import type { ChatMessage, Conversation, Demand, Proposal, User } from '@rubli/shared';

export const memoryStore = {
  users: [] as User[],
  demands: [] as Demand[],
  proposals: [] as Proposal[],
  conversations: [] as Conversation[],
  messages: [] as ChatMessage[],
};
