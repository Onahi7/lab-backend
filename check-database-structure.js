const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb+srv://mmmnigeriaschool12_db_user:Iamhardy_7*@cluster0.abdi7yt.mongodb.net/carefaamlab?retryWrites=true&w=majority&appName=Cluster0&ssl=true&authSource=admin';

async function checkDatabaseStructure() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected successfully\n');

    const db = mongoose.connection.db;

    // Check collections
    const collections = await db.listCollections().toArray();
    console.log('Available collections:');
    collections.forEach(col => console.log(`  - ${col.name}`));

    // Check order_tests structure
    console.log('\n=== ORDER_TESTS STRUCTURE ===');
    const sampleOrderTest = await db.collection('order_tests').findOne({});
    if (sampleOrderTest) {
      console.log('Sample order_test document:');
      console.log(JSON.stringify(sampleOrderTest, null, 2));
    } else {
      console.log('No order_tests found');
    }

    // Check test_results structure
    console.log('\n=== TEST_RESULTS STRUCTURE ===');
    const sampleResult = await db.collection('test_results').findOne({});
    if (sampleResult) {
      console.log('Sample test_result document:');
      console.log(JSON.stringify(sampleResult, null, 2));
    } else {
      console.log('No test_results found');
    }

    // Check orders structure
    console.log('\n=== ORDERS STRUCTURE ===');
    const sampleOrder = await db.collection('orders').findOne({});
    if (sampleOrder) {
      console.log('Sample order document (first 500 chars):');
      const orderStr = JSON.stringify(sampleOrder, null, 2);
      console.log(orderStr.substring(0, 500) + '...');
    } else {
      console.log('No orders found');
    }

    // Count documents
    console.log('\n=== DOCUMENT COUNTS ===');
    const orderCount = await db.collection('orders').countDocuments();
    const orderTestCount = await db.collection('order_tests').countDocuments();
    const resultCount = await db.collection('test_results').countDocuments();
    console.log(`Orders: ${orderCount}`);
    console.log(`Order Tests: ${orderTestCount}`);
    console.log(`Test Results: ${resultCount}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
  }
}

checkDatabaseStructure();
