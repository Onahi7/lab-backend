/**
 * Get Order IDs for the test patients
 */

const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb+srv://mmmnigeriaschool12_db_user:Iamhardy_7*@cluster0.abdi7yt.mongodb.net/carefaamlab?retryWrites=true&w=majority&appName=Cluster0&ssl=true&authSource=admin';

async function main() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected\n');

    const db = mongoose.connection.db;

    // Find orders for our test patients
    const orders = await db.collection('orders').find({
      orderNumber: { $regex: /^ORD-177367/ }
    }).sort({ orderDate: -1 }).limit(2).toArray();

    console.log('📋 Test Orders:\n');
    console.log('═'.repeat(100));

    for (const order of orders) {
      const patient = await db.collection('patients').findOne({ _id: order.patientId });
      const resultCount = await db.collection('results').countDocuments({ orderId: order._id });

      console.log(`\n👤 Patient: ${patient.firstName} ${patient.lastName}`);
      console.log(`   Age: ${patient.age} ${patient.age === 0 ? 'days' : 'years'}`);
      console.log(`   Gender: ${patient.gender}`);
      console.log(`   Order Number: ${order.orderNumber}`);
      console.log(`   Order ID (MongoDB): ${order._id}`);
      console.log(`   Status: ${order.status}`);
      console.log(`   Tests: ${order.tests?.length || 0}`);
      console.log(`   Results: ${resultCount}`);
      console.log(`\n   🔗 Report URLs:`);
      console.log(`      By Order Number: http://localhost:8080/lab/reports/${order.orderNumber}`);
      console.log(`      By MongoDB ID: http://localhost:8080/lab/reports/${order._id}`);
    }

    console.log('\n' + '═'.repeat(100));
    console.log('\n💡 Copy one of the URLs above and paste in your browser to view the report!');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected');
  }
}

main();
