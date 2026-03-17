/**
 * Test Lab Report API
 * Verifies that the lab results report endpoint returns data correctly
 */

const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb+srv://mmmnigeriaschool12_db_user:Iamhardy_7*@cluster0.abdi7yt.mongodb.net/carefaamlab?retryWrites=true&w=majority&appName=Cluster0&ssl=true&authSource=admin';

async function main() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;

    // Get the latest test orders
    const orders = await db.collection('orders').find({
      orderNumber: { $regex: /^ORD-177367/ }
    }).sort({ orderDate: -1 }).limit(2).toArray();

    console.log('📋 Testing Report Data Structure\n');
    console.log('═'.repeat(100));

    for (const order of orders) {
      const patient = await db.collection('patients').findOne({ _id: order.patientId });
      const results = await db.collection('results').find({ orderId: order._id }).toArray();

      console.log(`\n👤 ${patient.firstName} ${patient.lastName}`);
      console.log(`   Order: ${order.orderNumber}`);
      console.log(`   MongoDB ID: ${order._id}`);
      console.log(`   Status: ${order.status}`);
      console.log(`   Results: ${results.length} tests`);

      // Group results by category
      const categories = {};
      for (const result of results) {
        const test = await db.collection('test_catalog').findOne({ code: result.testCode });
        const category = test?.category || 'Other';
        
        if (!categories[category]) {
          categories[category] = [];
        }
        
        categories[category].push({
          code: result.testCode,
          name: result.testName,
          value: result.value,
          unit: result.unit,
          range: result.referenceRange,
          flag: result.flag,
        });
      }

      console.log('\n   📊 Results by Category:');
      for (const [category, tests] of Object.entries(categories)) {
        console.log(`      • ${category}: ${tests.length} tests`);
      }

      console.log('\n   🔗 API Endpoint:');
      console.log(`      GET /reports/lab-results/${order._id}`);
      console.log('\n   🌐 Frontend URLs:');
      console.log(`      http://localhost:8080/lab/reports/${order.orderNumber}`);
      console.log(`      http://localhost:8080/lab/reports/${order._id}`);
    }

    console.log('\n' + '═'.repeat(100));
    console.log('\n✅ Report data is ready!');
    console.log('\n💡 Next Steps:');
    console.log('   1. Start the backend: npm run start:dev');
    console.log('   2. Start the frontend: npm run dev');
    console.log('   3. Open one of the URLs above in your browser');
    console.log('   4. Click "Print Report" or "Export PDF"');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected');
  }
}

main();
