import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import websocket from '@fastify/websocket';
import { registerAuthRoutes } from './routes/auth.js';
import { registerDemandRoutes } from './routes/demands.js';
import { registerProposalRoutes } from './routes/proposals.js';
import { registerChatRoutes } from './routes/chat.js';
import { registerNearbyRoutes } from './routes/nearby.js';
import { registerNotificationRoutes } from './routes/notifications.js';
import { registerRatingRoutes } from './routes/ratings.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerSupportRoutes } from './routes/support.js';
import { attachRealtimeClient } from './realtime.js';
import { closeDatabase, ensureDatabaseIndexes, getDatabase } from './store/database.js';

// Fotos de chamadas de teste são enviadas como data URI; limite abaixo do máximo de 16 MB do MongoDB.
const app = Fastify({ logger: true, bodyLimit: 10 * 1024 * 1024 });

await app.register(helmet);
await app.register(cors, { origin: true });
await app.register(websocket);
await registerAuthRoutes(app);
await registerDemandRoutes(app);
await registerProposalRoutes(app);
await registerChatRoutes(app);
await registerNearbyRoutes(app);
await registerNotificationRoutes(app);
await registerRatingRoutes(app);
await registerSupportRoutes(app);
await registerAdminRoutes(app);

app.get('/api/v1/realtime', { websocket: true }, (socket) => {
  attachRealtimeClient(socket);
});

const mongoUri = process.env.MONGODB_URI;
let mongoConnected = false;

if (mongoUri) {
  await getDatabase();
  await ensureDatabaseIndexes();
  mongoConnected = true;
  app.log.info('MongoDB connected');
} else {
  app.log.warn('MONGODB_URI not configured; running in temporary in-memory mode');
}

app.get('/health', async () => ({
  ok: true,
  service: 'rubli-api',
  version: '0.1.0',
  persistence: mongoConnected ? 'mongodb' : 'memory',
  realtime: true,
  push: true,
}));

app.get('/api/v1', async () => ({
  name: 'Rubli API',
  message: 'Quem precisa, encontra quem resolve.',
  mode: mongoConnected ? 'online' : 'development-offline',
  realtime: true,
  push: true,
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
  await closeDatabase();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
