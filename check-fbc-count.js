const { MongoClient } = require('mongodb');
const fs = require('fs');

// Read .env file manually
const envContent = fs.readFileSync('.env', 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length) {
    envVars[key.trim()] = valueParts.join('=').trim();
  }
});
process.env.MONGODB_URI = envVars.MONGODB_URI;

(async () => {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db('carefaamlab');
  
  // Check what statuses exist
  const statuses = await db.collection('orders').distinct('status');
  console.log('Available statuses:', statuses);
  
  // Get a completed order
  const order = await db.collection('orders').findOne({ status: 'completed' });
  
  if (!order) {
    console.log('No orders found');
    await client.close();
    return;
  }
  
  console.log('\nOrder ID:', order._id);
  console.log('Order Number:', order.order_number || order.order_id || 'N/A');
  console.log('Status:', order.status);
  
  // Get the test results
  const results = await db.collection('results').find({ order_id: order._id }).toArray();
  console.log('Total results:', results.length);
  
  const fbcResults = results.filter(r => r.category === 'hematology');
  console.log('\nFBC/Hematology tests:', fbcResults.length);
  fbcResults.forEach((r, i) => console.log(`${i+1}. ${r.test_name}`));
  
  await client.close();
})();
