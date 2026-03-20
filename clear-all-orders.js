const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb+srv://mmmnigeriaschool12_db_user:Iamhardy_7*@cluster0.abdi7yt.mongodb.net/carefaamlab?retryWrites=true&w=majority&appName=Cluster0&ssl=true&authSource=admin';

async function clearAllOrders() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected successfully');

    const db = mongoose.connection.db;

    // Clear orders collection
    console.log('\nClearing orders...');
    const ordersResult = await db.collection('orders').deleteMany({});
    console.log(`✓ Deleted ${ordersResult.deletedCount} orders`);

    // Clear order_tests collection
    console.log('Clearing order_tests...');
    const orderTestsResult = await db.collection('order_tests').deleteMany({});
    console.log(`✓ Deleted ${orderTestsResult.deletedCount} order tests`);

    // Clear test_results collection
    console.log('Clearing test_results...');
    const resultsResult = await db.collection('test_results').deleteMany({});
    console.log(`✓ Deleted ${resultsResult.deletedCount} test results`);

    console.log('\n✅ All orders and results cleared successfully!');
    console.log('\nSummary:');
    console.log(`  - Orders: ${ordersResult.deletedCount}`);
    console.log(`  - Order Tests: ${orderTestsResult.deletedCount}`);
    console.log(`  - Test Results: ${resultsResult.deletedCount}`);

  } catch (error) {
    console.error('Error clearing data:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
  }
}

clearAllOrders();
