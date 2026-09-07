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
    database.collection('push_tokens').createIndex({ userId: 1, token: 1 }, { unique: true }),
  ]);
}

export async function closeDatabase() {
  if (!client) return;
  await client.close();
  client = null;
  db = null;
}
