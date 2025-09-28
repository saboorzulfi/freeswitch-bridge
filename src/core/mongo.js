import { MongoClient } from 'mongodb';
import { config } from './config.js';
import { logger } from './logger.js';

let client;
let dbInstance;

export async function connectMongo() {
  if (dbInstance) return dbInstance;
  const { uri, db } = config.mongo;
  logger.info({ uri, db }, 'Connecting to MongoDB');
  client = new MongoClient(uri, { maxPoolSize: 10 });
  await client.connect();
  dbInstance = client.db(db);
  logger.info('MongoDB connected');
  return dbInstance;
}

export function getDb() {
  if (!dbInstance) throw new Error('Mongo not connected');
  return dbInstance;
}

export async function closeMongo() {
  if (client) await client.close();
  client = undefined;
  dbInstance = undefined;
}

export default { connectMongo, getDb, closeMongo };

