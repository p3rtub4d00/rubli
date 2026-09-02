import type { FastifyInstance } from 'fastify';
import type { ChatMessage, Conversation, CreateMessageInput } from '@rubli/shared';
import { memoryStore } from '../store/memoryStore.js';
import { getDatabase } from '../store/database.js';
import { broadcastRealtime } from '../realtime.js';
import { sendPushToUsers } from '../push.js';

function id(prefix: string) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }

async function listConversations(filters: { demandId?: string; customerId?: string; providerId?: string }) {
  const db = await getDatabase();
  if (!db) return memoryStore.conversations.filter((conversation) => (!filters.demandId || conversation.demandId === filters.demandId) && (!filters.customerId || conversation.customerId === filters.customerId) && (!filters.providerId || conversation.providerId === filters.providerId));
  const query: Record<string, string> = {};
  if (filters.demandId) query.demandId = filters.demandId;
  if (filters.customerId) query.customerId = filters.customerId;
  if (filters.providerId) query.providerId = filters.providerId;
  return db.collection<Conversation>('conversations').find(query).sort({ updatedAt: -1 }).toArray();
}

async function findConversation(conversationId: string) {
  const db = await getDatabase();
  if (!db) return memoryStore.conversations.find((item) => item.id === conversationId);
  return db.collection<Conversation>('conversations').findOne({ id: conversationId });
}

async function persistConversation(conversation: Conversation) {
  const db = await getDatabase();
  if (!db) {
    const index = memoryStore.conversations.findIndex((item) => item.id === conversation.id);
    if (index >= 0) memoryStore.conversations[index] = conversation; else memoryStore.conversations.unshift(conversation);
    return;
  }
  await db.collection<Conversation>('conversations').replaceOne({ id: conversation.id }, conversation, { upsert: true });
}

async function listMessages(conversationId: string) {
  const db = await getDatabase();
  if (!db) return memoryStore.messages.filter((message) => message.conversationId === conversationId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return db.collection<ChatMessage>('messages').find({ conversationId }).sort({ createdAt: 1 }).toArray();
}

async function findMessage(messageId: string) {
  const db = await getDatabase();
  if (!db) return memoryStore.messages.find((item) => item.id === messageId);
  return db.collection<ChatMessage>('messages').findOne({ id: messageId });
}

async function persistMessage(message: ChatMessage) {
  const db = await getDatabase();
  if (!db) {
    const index = memoryStore.messages.findIndex((item) => item.id === message.id);
    if (index >= 0) memoryStore.messages[index] = message; else memoryStore.messages.push(message);
    return;
  }
  await db.collection<ChatMessage>('messages').replaceOne({ id: message.id }, message, { upsert: true });
}

export async function registerChatRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { demandId?: string; customerId?: string; providerId?: string } }>('/api/v1/conversations', async (request) => listConversations(request.query));

  app.post<{ Body: Partial<Conversation> }>('/api/v1/conversations', async (request, reply) => {
    const body = request.body ?? {};
    if (!body.demandId || !body.customerId || !body.providerId) return reply.code(400).send({ error: 'INVALID_CONVERSATION', message: 'Informe demanda, cliente e prestador.' });
    const existing = (await listConversations(body)).find((item) => item.demandId === body.demandId && item.customerId === body.customerId && item.providerId === body.providerId);
    if (existing) return existing;
    const now = new Date().toISOString();
    const conversation: Conversation = { demandId: body.demandId, customerId: body.customerId, providerId: body.providerId, id: body.id ?? id('conv'), createdAt: body.createdAt ?? now, updatedAt: body.updatedAt ?? now, ...(body.lastMessageAt ? { lastMessageAt: body.lastMessageAt } : {}) };
    await persistConversation(conversation);
    return reply.code(201).send(conversation);
  });

  app.get<{ Params: { id: string } }>('/api/v1/conversations/:id/messages', async (request, reply) => {
    const conversation = await findConversation(request.params.id);
    if (!conversation) return reply.code(404).send({ error: 'CONVERSATION_NOT_FOUND', message: 'Conversa não encontrada.' });
    return listMessages(conversation.id);
  });

  app.post<{ Body: CreateMessageInput & Partial<Pick<ChatMessage, 'id' | 'createdAt'>> }>('/api/v1/messages', async (request, reply) => {
    const body = request.body;
    if (!body?.conversationId || !body.senderId || !body.text?.trim()) return reply.code(400).send({ error: 'INVALID_MESSAGE', message: 'A mensagem não pode ficar vazia.' });
    const conversation = await findConversation(body.conversationId);
    if (!conversation) return reply.code(404).send({ error: 'CONVERSATION_NOT_FOUND', message: 'Conversa não encontrada.' });
    if (![conversation.customerId, conversation.providerId].includes(body.senderId)) return reply.code(403).send({ error: 'NOT_ALLOWED', message: 'Usuário não participa desta conversa.' });

    const messageId = body.id ?? id('msg');
    const existing = await findMessage(messageId);
    if (existing) return reply.code(200).send(existing);

    const now = new Date().toISOString();
    const message: ChatMessage = { id: messageId, conversationId: conversation.id, senderId: body.senderId, text: body.text.trim(), createdAt: body.createdAt ?? now };
    await persistMessage(message);
    await persistConversation({ ...conversation, updatedAt: now, lastMessageAt: now });
    const recipientId = body.senderId === conversation.customerId ? conversation.providerId : conversation.customerId;
    broadcastRealtime({ type: 'message.created', conversationId: conversation.id, demandId: conversation.demandId, actorUserId: body.senderId, at: now });
    await sendPushToUsers([recipientId], { title: 'Nova mensagem no Rubli', body: message.text.slice(0, 120), data: { type: 'message', conversationId: conversation.id, demandId: conversation.demandId } });
    return reply.code(201).send(message);
  });
}
