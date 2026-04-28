const { MongoClient, ObjectId } = require('mongodb');

const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017';
const MONGODB_DB = process.env.MONGODB_DB || 'wms_production';

async function createInvoiceData() {
  const client = new MongoClient(MONGODB_URL);
  try {
    await client.connect();
    const db = client.db(MONGODB_DB);
    
    // Clear old test invoices
    await db.collection('invoice_master').deleteMany({ invoiceNumber: { $regex: 'INV-' } });
    await db.collection('invoice_line_items').deleteMany({ description: { $regex: 'Storage Rent' } });
    
    // Get the user to get correct userId
    const user = await db.collection('users').findOne({ email: 'bharatgodam.techsolutions@gmail.com' });
    if (!user) {
      console.log('User not found');
      return;
    }
    
    console.log('User ID:', user._id.toString());
    console.log('User email:', user.email);
    
    // Get the two target warehouses
    const warehouses = await db.collection('warehouses').find({
      name: { $in: ['Bhalal Dharmendrabhai -7', 'Ritaben Amitkumar Vithalani-5'] }
    }).toArray();
    
    if (warehouses.length !== 2) {
      console.log('Error: Could not find both warehouses');
      return;
    }
    
    console.log('Found warehouses:', warehouses.map(w => w.name));
    
    // Get or create client with correct user info
    let client_doc = await db.collection('clients').findOne({ name: 'Test Client' });
    if (!client_doc) {
      const result = await db.collection('clients').insertOne({
        name: 'Test Client',
        email: 'client@test.com',
        userEmail: user.email,
        userId: user._id,
        status: 'ACTIVE',
        createdAt: new Date()
      });
      client_doc = { _id: result.insertedId };
      console.log('Created test client');
    } else {
      console.log('Using existing test client');
    }
    
    // Get or create commodity
    let commodity = await db.collection('commodities').findOne({ name: 'Test Commodity' });
    if (!commodity) {
      const result = await db.collection('commodities').insertOne({
        name: 'Test Commodity',
        ratePerMtMonth: 1000,
        userEmail: user.email,
        userId: user._id,
        status: 'ACTIVE',
        createdAt: new Date()
      });
      commodity = { _id: result.insertedId };
      console.log('Created test commodity');
    } else {
      console.log('Using existing test commodity');
    }
    
    // Create invoices with correct user info
    let count = 0;
    for (const warehouse of warehouses) {
      for (let i = 0; i < 3; i++) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        
        const invoiceTotal = 60000 + (i * 10000);
        
        const invoiceResult = await db.collection('invoice_master').insertOne({
          invoiceNumber: `INV-${warehouse.name.substring(0, 3).toUpperCase()}-${monthStr.replace('-', '')}-00${i}`,
          clientId: client_doc._id,
          warehouseId: warehouse._id,
          commodityId: commodity._id,
          month: monthStr,
          invoiceDate: date,
          dueDate: new Date(date.getTime() + 30 * 24 * 60 * 60 * 1000),
          totalAmount: invoiceTotal,
          gstAmount: Math.round(invoiceTotal * 0.18),
          finalAmount: Math.round(invoiceTotal * 1.18),
          status: 'PAID',
          userEmail: user.email,
          userId: user._id,
          createdAt: new Date(),
          createdBy: user.email
        });
        
        // Create line item
        await db.collection('invoice_line_items').insertOne({
          invoiceMasterId: invoiceResult.insertedId,
          clientId: client_doc._id,
          warehouseId: warehouse._id,
          commodityId: commodity._id,
          description: `Storage Rent - ${monthStr}`,
          quantity: 100,
          rate: 600,
          amount: invoiceTotal,
          status: 'ACTIVE',
          userEmail: user.email,
          userId: user._id,
          createdAt: new Date()
        });
        
        count++;
      }
    }
    
    console.log(`✓ Created ${count} invoices with correct user info`);
    
  } finally {
    await client.close();
  }
}

createInvoiceData().catch(console.error);

