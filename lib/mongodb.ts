import { MongoClient, ServerApiVersion, Db } from 'mongodb';

const uri = process.env.MONGODB_URL || process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || extractDatabaseNameFromUri(uri);

if (!uri) {
  throw new Error('Invalid/Missing environment variable: "MONGODB_URL" or "MONGODB_URI"');
}
if (!dbName) {
  throw new Error(
    'Invalid/Missing environment variable: "MONGODB_DB". ' +
      'If your MongoDB URI includes the database name, ensure the URI contains it as the path component or set MONGODB_DB explicitly.'
  );
}

function extractDatabaseNameFromUri(uri?: string): string | undefined {
  if (!uri) return undefined;
  const match = uri.match(/^[^:]+:\/\/[^/]+\/([^?]+)/);
  if (!match || !match[1]) return undefined;
  const dbName = match[1].trim();
  return dbName || undefined;
}

const options = {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
  maxPoolSize: 10, // Optimize for Serverless architectures
};

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

if (process.env.NODE_ENV === 'development') {
  // In development mode, use a global variable so that the value
  // is preserved across module reloads caused by HMR (Hot Module Replacement).
  let globalWithMongo = global as typeof globalThis & {
    _mongoClientPromise?: Promise<MongoClient>;
  };

  if (!globalWithMongo._mongoClientPromise) {
    client = new MongoClient(uri, options);
    globalWithMongo._mongoClientPromise = client.connect();
  }
  clientPromise = globalWithMongo._mongoClientPromise;
} else {
  // In production mode, it's best to not use a global variable.
  client = new MongoClient(uri, options);
  clientPromise = client.connect();
}

/**
 * Utility function to quickly grab the database instance.
 */
export async function getDb(): Promise<Db> {
  const connectedClient = await clientPromise;
  return connectedClient.db(dbName);
}

export default clientPromise;
