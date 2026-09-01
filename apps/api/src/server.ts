import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import websocket from '@fastify/websocket';
import { MongoClient } from 'mongodb';
import { registerAuthRoutes } from './routes/auth.js';
import { registerDemandRoutes } from './routes/demands.js';
import { registerProposalRoutes } from './routes/proposals.js';
import { registerChatRoutes } from './routes/chat.js';
import { registerNearbyRoutes } from './routes/nearby.js';
import { attachRealtimeClient } from './realtime.js';

const app = Fastify({ logger: true });

await app.register(helmet);
await app.register(cors, { origin: true });
await app.register(websocket);
await registerAuthRoutes(app);
await registerDemandRoutes(app);
await registerProposalRoutes(app);
await registerChatRoutes(app);
await registerNearbyRoutes(app);

app.get('/api/v1/realtime', { websocket: true }, (socket) => {
  attachRealtimeClient(socket);
});

const mongoUri = process.env.MONGODB_URI;
let mongoClient: MongoClient | undefined;

if (mongoUri) {
  mongoClient = new MongoClient(mongoUri);
  await mongoClient.connect();
  app.log.info('MongoDB connected');
} else {
  app.log.warn('MONGODB_URI not configured; running in temporary in-memory mode');
}

app.get('/health', async () => ({
  ok: true,
  service: 'rubli-api',
  version: '0.1.0',
  persistence: mongoClient ? 'mongodb' : 'memory',
  realtime: true,
}));

app.get('/api/v1', async () => ({
  name: 'Rubli API',
  message: 'Quem precisa, encontra quem resolve.',
  mode: mongoClient ? 'online' : 'development-offline',
  realtime: true,
}));

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

const shutdown = async () => {
  await app.close();
  await mongoClient?.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
