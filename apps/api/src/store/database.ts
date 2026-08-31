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

export async function closeDatabase() {
  if (!client) return;
  await client.close();
  client = null;
  db = null;
}
