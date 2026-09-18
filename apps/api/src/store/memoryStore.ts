import type { CancellationRequest, ChatMessage, Conversation, Demand, Dispute, Proposal, Rating, ScheduleChange, User } from '@rubli/shared';

export const memoryStore = {
  users: [] as User[],
  demands: [] as Demand[],
  proposals: [] as Proposal[],
  conversations: [] as Conversation[],
  messages: [] as ChatMessage[],
  ratings: [] as Rating[],
  cancellationRequests: [] as CancellationRequest[],
  disputes: [] as Dispute[],
  scheduleChanges: [] as ScheduleChange[],
};
