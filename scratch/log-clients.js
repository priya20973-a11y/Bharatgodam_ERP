const { MongoClient } = require('mongodb');

async function main() {
  const uri = "mongodb+srv://rutvi2005:5v1jj9zVisOxVUUn@cluster0.ecnv50o.mongodb.net/wms_production?appName=Cluster0";
  console.log("Connecting to MongoDB Atlas Cluster...");
  const client = new MongoClient(uri);
  try {
    await client.connect();
    console.log("Connected to MongoDB!");
    const db = client.db();
    
    // Check both collections: 'clients' and 'client_accounts' (legacy)
    const clients = await db.collection('clients').find({}).toArray();
    console.log("Clients count:", clients.length);
    console.log("Clients list:", JSON.stringify(clients.map(c => ({ _id: c._id, name: c.name, nameKey: c.nameKey, userId: c.userId, userEmail: c.userEmail })), null, 2));

    const legacyClients = await db.collection('client_accounts').find({}).toArray();
    console.log("Legacy Client Accounts count:", legacyClients.length);
    console.log("Legacy Clients list:", JSON.stringify(legacyClients.map(c => ({ _id: c._id, name: c.name || c.clientName, userId: c.userId })), null, 2));
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await client.close();
  }
}

main();
