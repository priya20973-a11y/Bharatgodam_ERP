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

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var __mongooseCached: MongooseCache | undefined;
}

let cached: MongooseCache = globalThis.__mongooseCached || { conn: null, promise: null };

if (!globalThis.__mongooseCached) {
  globalThis.__mongooseCached = cached;
}

async function connectToDatabase(): Promise<typeof mongoose> {
  // If already connected, return cached connection immediately
  if (cached.conn && cached.conn.connection.readyState === 1) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts: mongoose.ConnectOptions = {
      bufferCommands: false,
      maxPoolSize: 10,
      minPoolSize: 1,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 5000,
      dbName: MONGODB_DB,
      retryWrites: true,
      w: 'majority',
      // Disable autoIndex in production serverless to prevent expensive index recreation on cold starts
      autoIndex: process.env.NODE_ENV !== 'production',
    };

    const startTime = performance.now();
    cached.promise = mongoose.connect(mongoUrl, opts).then((mongooseInstance) => {
      if (process.env.ENABLE_PERF_LOGS !== 'false') {
        const duration = (performance.now() - startTime).toFixed(1);
        console.log(`[DB_PERF] MongoDB connected in ${duration}ms (db: ${MONGODB_DB})`);
      }
      return mongooseInstance;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null; // Reset promise so subsequent requests can retry
    throw e;
  }

  return cached.conn;
}

export default connectToDatabase;

