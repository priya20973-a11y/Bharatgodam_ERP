import { Db, MongoClient } from 'mongodb';
import connectToDatabase from './mongoose';

/**
 * Utility function to quickly grab the database instance.
 * Reuses the single cached global connection pool from mongoose to prevent
 * dual connection pool overhead in serverless environments.
 */
export async function getDb(): Promise<Db> {
  const mongooseInstance = await connectToDatabase();
  const db = mongooseInstance.connection.db;
  if (!db) {
    throw new Error('Database connection established but db instance is undefined.');
  }
  return db as unknown as Db;
}

/**
 * Optional helper if direct access to the underlying MongoClient is needed.
 */
export async function getClient(): Promise<MongoClient> {
  const mongooseInstance = await connectToDatabase();
  const client = mongooseInstance.connection.getClient();
  if (!client) {
    throw new Error('Database connection established but MongoClient instance is undefined.');
  }
  return client as unknown as MongoClient;
}


