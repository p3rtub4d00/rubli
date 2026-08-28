import type { FastifyInstance } from 'fastify';
import type { ChatMessage, Conversation, CreateMessageInput } from '@rubli/shared';
import { memoryStore } from '../store/memoryStore.js';

function id(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function registerChatRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { demandId?: string; customerId?: string; providerId?: string } }>(
    '/api/v1/conversations',
    async (request) => {
      const { demandId, customerId, providerId } = request.query;
      return memoryStore.conversations.filter((conversation) =>
        (!demandId || conversation.demandId === demandId) &&
        (!customerId || conversation.customerId === customerId) &&
        (!providerId || conversation.providerId === providerId),
      );
    },
  );

  app.post<{ Body: Omit<Conversation, 'id' | 'createdAt' | 'updatedAt' | 'lastMessageAt'> }>(
    '/api/v1/conversations',
    async (request, reply) => {
      const body = request.body;
      if (!body?.demandId || !body.customerId || !body.providerId) {
        return reply.code(400).send({ error: 'INVALID_CONVERSATION', message: 'Informe demanda, cliente e prestador.' });
      }

      const existing = memoryStore.conversations.find(
        (item) => item.demandId === body.demandId && item.customerId === body.customerId && item.providerId === body.providerId,
      );
      if (existing) return existing;

      const now = new Date().toISOString();
      const conversation: Conversation = { ...body, id: id('conv'), createdAt: now, updatedAt: now };
      memoryStore.conversations.unshift(conversation);
      return reply.code(201).send(conversation);
    },
  );

  app.get<{ Params: { id: string } }>('/api/v1/conversations/:id/messages', async (request, reply) => {
    const conversation = memoryStore.conversations.find((item) => item.id === request.params.id);
    if (!conversation) {
      return reply.code(404).send({ error: 'CONVERSATION_NOT_FOUND', message: 'Conversa não encontrada.' });
    }
    return memoryStore.messages
      .filter((message) => message.conversationId === conversation.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  });

  app.post<{ Body: CreateMessageInput }>('/api/v1/messages', async (request, reply) => {
    const body = request.body;
    if (!body?.conversationId || !body.senderId || !body.text?.trim()) {
      return reply.code(400).send({ error: 'INVALID_MESSAGE', message: 'A mensagem não pode ficar vazia.' });
    }

    const conversation = memoryStore.conversations.find((item) => item.id === body.conversationId);
    if (!conversation) {
      return reply.code(404).send({ error: 'CONVERSATION_NOT_FOUND', message: 'Conversa não encontrada.' });
    }
    if (![conversation.customerId, conversation.providerId].includes(body.senderId)) {
      return reply.code(403).send({ error: 'NOT_ALLOWED', message: 'Usuário não participa desta conversa.' });
    }

    const now = new Date().toISOString();
    const message: ChatMessage = {
      id: id('msg'),
      conversationId: conversation.id,
      senderId: body.senderId,
      text: body.text.trim(),
      createdAt: now,
    };
    memoryStore.messages.push(message);
    conversation.updatedAt = now;
    conversation.lastMessageAt = now;
    return reply.code(201).send(message);
  });
}
