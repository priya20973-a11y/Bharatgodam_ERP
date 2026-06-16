import mongoose from 'mongoose';

const MONGODB_URL = process.env.MONGODB_URL || process.env.MONGODB_URI;
const MONGODB_DB =
  process.env.MONGODB_DB ||
  extractDatabaseNameFromUri(MONGODB_URL) ||
  'wms_production';

if (!MONGODB_URL) {
  throw new Error('Invalid/Missing environment variable: "MONGODB_URL" or "MONGODB_URI"');
}

function extractDatabaseNameFromUri(uri?: string): string | undefined {
  if (!uri) return undefined;
  const match = uri.match(/^[^:]+:\/\/[^/]+\/([^?]+)/);
  if (!match || !match[1]) return undefined;
  const dbName = match[1].trim();
  return dbName || undefined;
}

const mongoUrl = MONGODB_URL as string;

let cached = (global as any).mongoose;

if (!cached) {
  cached = (global as any).mongoose = { conn: null, promise: null };
}

async function connectToDatabase() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      dbName: MONGODB_DB,
      retryWrites: true,
      w: 'majority',
      readPreference: 'primary',
    };

    cached.promise = mongoose.connect(mongoUrl, opts).then((mongoose) => {
      return mongoose;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

export default connectToDatabase;
