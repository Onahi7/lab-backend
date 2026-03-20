const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb+srv://mmmnigeriaschool12_db_user:Iamhardy_7*@cluster0.abdi7yt.mongodb.net/carefaamlab?retryWrites=true&w=majority&appName=Cluster0&ssl=true&authSource=admin';

async function main() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected\n');

    const db = mongoose.connection.db;

    // Get the most recent order
    const order = await db.collection('orders').findOne(
      {},
      { sort: { orderDate: -1 } }
    );

    if (!order) {
      console.log('No orders found');
      return;
    }

    console.log(`📊 Order: ${order.orderNumber}`);
    console.log(`Order ID: ${order._id}`);
    console.log(`Status: ${order.status}\n`);

    // Get results for this order
    const results = await db.collection('results').find({ orderId: order._id }).toArray();

    console.log(`Total Results: ${results.length}\n`);

    if (results.length === 0) {
      console.log('⚠️  No results found for this order!');
      console.log('\nChecking if results exist with different field name...');
      
      // Try with order_id
      const resultsAlt = await db.collection('results').find({ order_id: order._id }).toArray();
      console.log(`Results with order_id field: ${resultsAlt.length}`);
      
      if (resultsAlt.length > 0) {
        console.log('\n✅ Found results using order_id field instead of orderId');
        console.log('Sample result:');
        console.log(JSON.stringify(resultsAlt[0], null, 2));
      }
      
      await mongoose.disconnect();
      return;
    }

    // Group by category, then by panel
    const grouped = {};
    results.forEach(r => {
      const cat = r.category || 'other';
      if (!grouped[cat]) grouped[cat] = {};
      
      const panel = r.panel_name || r.panelName || 'No Panel';
      if (!grouped[cat][panel]) grouped[cat][panel] = [];
      
      grouped[cat][panel].push(r);
    });

    // Display grouping
    console.log('═'.repeat(80));
    console.log('RESULTS GROUPED BY CATEGORY AND PANEL');
    console.log('═'.repeat(80));

    for (const [category, panels] of Object.entries(grouped)) {
      console.log(`\n📁 ${category.toUpperCase()}`);
      console.log('─'.repeat(80));
      
      for (const [panelName, tests] of Object.entries(panels)) {
        console.log(`\n  📋 ${panelName} (${tests.length} tests)`);
        tests.slice(0, 5).forEach(t => {
          console.log(`     • ${t.testCode}: ${t.testName} = ${t.value} ${t.unit || ''}`);
        });
        if (tests.length > 5) {
          console.log(`     ... and ${tests.length - 5} more tests`);
        }
      }
    }

    console.log('\n' + '═'.repeat(80));
    console.log('🔗 View this report at:');
    console.log(`   http://localhost:8080/lab/reports/${order._id}`);
    console.log(`   http://localhost:8080/reception/reports/${order._id}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected');
  }
}

main();
