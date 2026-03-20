const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb+srv://mmmnigeriaschool12_db_user:Iamhardy_7*@cluster0.abdi7yt.mongodb.net/carefaamlab?retryWrites=true&w=majority&appName=Cluster0&ssl=true&authSource=admin';

async function checkResultDataStructure() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected successfully\n');

    const db = mongoose.connection.db;

    // Check if we have any orders
    const orderCount = await db.collection('orders').countDocuments();
    console.log(`Total orders: ${orderCount}`);

    if (orderCount === 0) {
      console.log('\n⚠️  No orders found in database');
      return;
    }

    // Get a sample order with its tests
    const sampleOrder = await db.collection('orders').findOne({});
    console.log('\n=== SAMPLE ORDER ===');
    console.log(`Order ID: ${sampleOrder._id}`);
    console.log(`Order Number: ${sampleOrder.orderNumber}`);
    console.log(`Status: ${sampleOrder.status}`);
    console.log(`Patient ID: ${sampleOrder.patientId}`);

    // Get order tests for this order
    const orderTests = await db.collection('order_tests')
      .find({ orderId: sampleOrder._id })
      .toArray();

    console.log(`\n=== ORDER TESTS (${orderTests.length} tests) ===`);
    orderTests.slice(0, 5).forEach((test, idx) => {
      console.log(`\nTest ${idx + 1}:`);
      console.log(`  _id: ${test._id}`);
      console.log(`  testCode: ${test.testCode}`);
      console.log(`  testName: ${test.testName}`);
      console.log(`  panelCode: ${test.panelCode || 'N/A'}`);
      console.log(`  panelName: ${test.panelName || 'N/A'}`);
      console.log(`  status: ${test.status}`);
      console.log(`  price: ${test.price}`);
    });

    if (orderTests.length > 5) {
      console.log(`\n... and ${orderTests.length - 5} more tests`);
    }

    // Check if there are any results
    const resultCount = await db.collection('results').countDocuments();
    console.log(`\n=== RESULTS ===`);
    console.log(`Total results in database: ${resultCount}`);

    if (resultCount > 0) {
      const sampleResult = await db.collection('results').findOne({});
      console.log('\nSample result structure:');
      console.log(JSON.stringify(sampleResult, null, 2));
    } else {
      console.log('\n⚠️  No results found in database');
      console.log('\nExpected result structure:');
      console.log({
        orderId: 'ObjectId (required) - references orders collection',
        orderTestId: 'ObjectId (optional) - references order_tests collection',
        testCode: 'string (required) - e.g., "WBC", "HB", "ALT"',
        testName: 'string (required) - e.g., "White Blood Cell Count"',
        value: 'string (required) - the test result value',
        unit: 'string (optional) - e.g., "g/dL", "10^9/L"',
        referenceRange: 'string (optional) - e.g., "12-16", "< 5.0"',
        flag: 'enum (required) - normal, low, high, critical_low, critical_high',
        status: 'enum (required) - preliminary, verified, amended',
        resultedAt: 'Date (required)',
        resultedBy: 'ObjectId (optional) - references profiles collection',
        verifiedAt: 'Date (optional)',
        verifiedBy: 'ObjectId (optional)',
        comments: 'string (optional)',
      });
    }

    // Show what data is needed to create a result
    console.log('\n=== TO CREATE A RESULT ===');
    console.log('Required fields:');
    console.log('  - orderId: MongoDB ObjectId from orders collection');
    console.log('  - testCode: Test code (e.g., "WBC", "HB")');
    console.log('  - testName: Full test name');
    console.log('  - value: The result value as string');
    console.log('  - flag: normal | low | high | critical_low | critical_high');
    console.log('\nOptional but recommended:');
    console.log('  - orderTestId: Links to specific order_test record');
    console.log('  - unit: Unit of measurement');
    console.log('  - referenceRange: Normal range for comparison');
    console.log('  - comments: Any additional notes');

    // Check test catalog for reference
    console.log('\n=== TEST CATALOG SAMPLE ===');
    const sampleTests = await db.collection('test_catalog')
      .find({})
      .limit(3)
      .toArray();

    sampleTests.forEach(test => {
      console.log(`\n${test.code} - ${test.name}`);
      console.log(`  Category: ${test.category}`);
      console.log(`  Panel: ${test.panelName || 'N/A'}`);
      console.log(`  Unit: ${test.unit || 'N/A'}`);
      console.log(`  Reference Range: ${test.referenceRange || 'N/A'}`);
      if (test.referenceRanges && test.referenceRanges.length > 0) {
        console.log(`  Age/Gender Ranges: ${test.referenceRanges.length} ranges defined`);
      }
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
  }
}

checkResultDataStructure();
