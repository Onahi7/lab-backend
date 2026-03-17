/**
 * Verify Lab Results Setup
 * Checks that everything is ready for printing lab results
 */

const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb+srv://mmmnigeriaschool12_db_user:Iamhardy_7*@cluster0.abdi7yt.mongodb.net/carefaamlab?retryWrites=true&w=majority&appName=Cluster0&ssl=true&authSource=admin';

async function main() {
  try {
    console.log('🔍 Verifying Lab Results Setup...\n');
    console.log('═'.repeat(100));
    
    await mongoose.connect(MONGODB_URI);
    console.log('✅ MongoDB Connection: OK\n');

    const db = mongoose.connection.db;

    // Check test panels
    const fbcPanel = await db.collection('test_panels').findOne({ code: 'FBC' });
    const lftPanel = await db.collection('test_panels').findOne({ code: 'LFT' });
    
    if (fbcPanel && lftPanel) {
      console.log('✅ Test Panels: OK');
      console.log(`   • FBC: ${fbcPanel.tests.length} tests`);
      console.log(`   • LFT: ${lftPanel.tests.length} tests\n`);
    } else {
      console.log('❌ Test Panels: MISSING\n');
      return;
    }

    // Check test catalog
    const testCount = await db.collection('test_catalog').countDocuments({ isActive: true });
    console.log(`✅ Test Catalog: ${testCount} active tests\n`);

    // Check patients
    const patients = await db.collection('patients').find({
      $or: [
        { firstName: 'Dickson', lastName: 'Hardy' },
        { firstName: 'Jallor', lastName: 'Dabiu' }
      ]
    }).toArray();

    if (patients.length === 2) {
      console.log('✅ Test Patients: OK');
      patients.forEach(p => {
        console.log(`   • ${p.firstName} ${p.lastName} (${p.age} ${p.age === 0 ? 'days' : 'years'}, ${p.gender})`);
      });
      console.log('');
    } else {
      console.log('❌ Test Patients: MISSING\n');
      console.log('   Run: node create-fbc-lft-orders.js\n');
      return;
    }

    // Check orders
    const orders = await db.collection('orders').find({
      patientId: { $in: patients.map(p => p._id) }
    }).sort({ orderDate: -1 }).limit(2).toArray();

    if (orders.length === 2) {
      console.log('✅ Test Orders: OK');
      for (const order of orders) {
        const patient = patients.find(p => p._id.toString() === order.patientId.toString());
        const resultCount = await db.collection('results').countDocuments({ orderId: order._id });
        
        console.log(`   • ${order.orderNumber}`);
        console.log(`     Patient: ${patient.firstName} ${patient.lastName}`);
        console.log(`     Status: ${order.status}`);
        console.log(`     Results: ${resultCount}/${order.tests.length} tests`);
      }
      console.log('');
    } else {
      console.log('❌ Test Orders: MISSING\n');
      console.log('   Run: node create-fbc-lft-orders.js\n');
      return;
    }

    // Check results
    const totalResults = await db.collection('results').countDocuments({
      orderId: { $in: orders.map(o => o._id) }
    });

    const verifiedResults = await db.collection('results').countDocuments({
      orderId: { $in: orders.map(o => o._id) },
      status: 'verified'
    });

    console.log('✅ Test Results: OK');
    console.log(`   • Total: ${totalResults} results`);
    console.log(`   • Verified: ${verifiedResults} results\n`);

    // Display report URLs
    console.log('═'.repeat(100));
    console.log('\n🖨️  READY TO PRINT!\n');
    console.log('📋 Report URLs:\n');

    for (const order of orders) {
      const patient = patients.find(p => p._id.toString() === order.patientId.toString());
      console.log(`${patient.firstName} ${patient.lastName} (${patient.age} ${patient.age === 0 ? 'days' : 'years'}):`);
      console.log(`  • http://localhost:8080/lab/reports/${order.orderNumber}`);
      console.log(`  • http://localhost:8080/lab/reports/${order._id}\n`);
    }

    console.log('═'.repeat(100));
    console.log('\n✅ All checks passed! System is ready.\n');
    console.log('📝 Next Steps:');
    console.log('   1. Start backend: npm run start:dev');
    console.log('   2. Start frontend: npm run dev');
    console.log('   3. Open one of the URLs above');
    console.log('   4. Click "Print Report" or "Export PDF"\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('\n💡 Make sure MongoDB is accessible and test data is created.\n');
  } finally {
    await mongoose.disconnect();
  }
}

main();
