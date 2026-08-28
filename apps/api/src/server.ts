import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { MongoClient } from 'mongodb';
import { registerDemandRoutes } from './routes/demands.js';

const app = Fastify({ logger: true });

await app.register(helmet);
await app.register(cors, { origin: true });
await registerDemandRoutes(app);

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
}));

app.get('/api/v1', async () => ({
  name: 'Rubli API',
  message: 'Quem precisa, encontra quem resolve.',
  mode: mongoClient ? 'online' : 'development-offline',
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
