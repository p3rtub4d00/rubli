import { Db, MongoClient } from 'mongodb';

let client: MongoClient | null = null;
let db: Db | null = null;

export async function getDatabase() {
  if (db) return db;
  const uri = process.env.MONGODB_URI;
  if (!uri) return null;
  client ??= new MongoClient(uri);
  await client.connect();
  db = client.db(process.env.MONGODB_DB ?? 'rubli');
  return db;
}

export async function ensureDatabaseIndexes() {
  const database = await getDatabase();
  if (!database) return;
  await Promise.all([
    database.collection('demands').createIndex({ id: 1 }, { unique: true }),
    database.collection('proposals').createIndex({ id: 1 }, { unique: true }),
    database.collection('proposals').createIndex({ demandId: 1, createdAt: -1 }),
    database.collection('conversations').createIndex({ id: 1 }, { unique: true }),
    database.collection('messages').createIndex({ id: 1 }, { unique: true }),
    database.collection('ratings').createIndex({ demandId: 1, fromUserId: 1 }, { unique: true }),
    database.collection('ratings').createIndex({ toUserId: 1, createdAt: -1 }),
    database.collection('push_tokens').createIndex({ userId: 1, token: 1 }, { unique: true }),
    database.collection('users').createIndex({ id: 1 }, { unique: true }),
    database.collection('users').createIndex({ email: 1 }, { unique: true, sparse: true }),
    database.collection('auth_users').createIndex({ email: 1 }, { unique: true }),
    database.collection('support_tickets').createIndex({ id: 1 }, { unique: true }),
    database.collection('support_tickets').createIndex({ status: 1, createdAt: -1 }),
    database.collection('cancellation_requests').createIndex({ id: 1 }, { unique: true }),
    database.collection('cancellation_requests').createIndex({ demandId: 1, createdAt: -1 }),
    database.collection('disputes').createIndex({ id: 1 }, { unique: true }),
    database.collection('disputes').createIndex({ demandId: 1, updatedAt: -1 }),
    database.collection('schedule_changes').createIndex({ id: 1 }, { unique: true }),
    database.collection('schedule_changes').createIndex({ demandId: 1, createdAt: -1 }),
  ]);
}

export async function closeDatabase() {
  if (!client) return;
  await client.close();
  client = null;
  db = null;
}
