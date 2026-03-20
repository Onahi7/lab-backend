const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb+srv://mmmnigeriaschool12_db_user:Iamhardy_7*@cluster0.abdi7yt.mongodb.net/carefaamlab?retryWrites=true&w=majority&appName=Cluster0&ssl=true&authSource=admin';

async function checkDuplicateResults() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected successfully\n');

    const db = mongoose.connection.db;

    // Get the first order
    const order = await db.collection('orders').findOne({});
    if (!order) {
      console.log('No orders found');
      return;
    }

    console.log(`Checking order: ${order.orderNumber} (${order._id})`);

    // Get all results for this order
    const results = await db.collection('results')
      .find({ orderId: order._id })
      .toArray();

    console.log(`\nTotal results: ${results.length}`);

    // Group by test code to find duplicates
    const testGroups = {};
    results.forEach(result => {
      const code = result.testCode;
      if (!testGroups[code]) {
        testGroups[code] = [];
      }
      testGroups[code].push(result);
    });

    // Show duplicates
    console.log('\n=== DUPLICATE ANALYSIS ===');
    let hasDuplicates = false;
    Object.entries(testGroups).forEach(([code, tests]) => {
      if (tests.length > 1) {
        hasDuplicates = true;
        console.log(`\n${code} - ${tests[0].testName}: ${tests.length} results`);
        tests.forEach((test, idx) => {
          console.log(`  ${idx + 1}. Value: ${test.value}, Created: ${test.createdAt}, ID: ${test._id}`);
        });
      }
    });

    if (!hasDuplicates) {
      console.log('No duplicate results found');
    }

    // Show unique test count
    const uniqueTests = Object.keys(testGroups).length;
    console.log(`\n=== SUMMARY ===`);
    console.log(`Unique tests: ${uniqueTests}`);
    console.log(`Total results: ${results.length}`);
    console.log(`Duplicates: ${results.length - uniqueTests}`);

    // Show sample results
    console.log('\n=== SAMPLE RESULTS (first 5) ===');
    results.slice(0, 5).forEach((result, idx) => {
      console.log(`\n${idx + 1}. ${result.testCode} - ${result.testName}`);
      console.log(`   Value: ${result.value} ${result.unit || ''}`);
      console.log(`   Reference: ${result.referenceRange || 'N/A'}`);
      console.log(`   Flag: ${result.flag}`);
      console.log(`   Created: ${result.createdAt}`);
      console.log(`   ID: ${result._id}`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
  }
}

checkDuplicateResults();
