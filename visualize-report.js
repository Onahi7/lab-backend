const { MongoClient, ObjectId } = require('mongodb');
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
  
  const orderId = '69b82effffc65341a37bab41';
  
  console.log('='.repeat(80));
  console.log('LAB REPORT VISUALIZATION');
  console.log('='.repeat(80));
  
  // Get order
  const order = await db.collection('orders').findOne({ _id: new ObjectId(orderId) });
  
  if (!order) {
    console.log('Order not found!');
    
    // Try to find any completed order
    console.log('\nSearching for any completed order...');
    const anyOrder = await db.collection('orders').findOne({ status: 'completed' });
    if (anyOrder) {
      console.log(`Found order: ${anyOrder._id}`);
      return visualizeOrder(db, anyOrder._id.toString());
    }
    
    await client.close();
    return;
  }
  
  await visualizeOrder(db, orderId);
  await client.close();
})();

async function visualizeOrder(db, orderId) {
  const order = await db.collection('orders').findOne({ _id: new ObjectId(orderId) });
  
  console.log('\n📋 ORDER INFORMATION');
  console.log('-'.repeat(80));
  console.log(`Order ID: ${order._id}`);
  console.log(`Status: ${order.status}`);
  console.log(`Created: ${order.created_at}`);
  
  // Get patient
  const patient = await db.collection('patients').findOne({ _id: order.patient_id });
  if (patient) {
    console.log('\n👤 PATIENT INFORMATION');
    console.log('-'.repeat(80));
    console.log(`Name: ${patient.first_name} ${patient.last_name}`);
    console.log(`Age: ${patient.age || 'N/A'}`);
    console.log(`Gender: ${patient.gender || 'N/A'}`);
  }
  
  // Get results
  const results = await db.collection('results').find({ order_id: order._id }).toArray();
  
  console.log('\n🧪 TEST RESULTS');
  console.log('-'.repeat(80));
  console.log(`Total Results: ${results.length}`);
  
  // Group by category
  const byCategory = {};
  results.forEach(r => {
    const cat = r.category || 'uncategorized';
    if (!byCategory[cat]) {
      byCategory[cat] = [];
    }
    byCategory[cat].push(r);
  });
  
  console.log('\nResults by Category:');
  Object.keys(byCategory).forEach(cat => {
    console.log(`  ${cat}: ${byCategory[cat].length} tests`);
  });
  
  // Show FBC/Hematology in detail
  if (byCategory.hematology) {
    console.log('\n' + '='.repeat(80));
    console.log('HEMATOLOGY (FBC) RESULTS - DETAILED VIEW');
    console.log('='.repeat(80));
    
    const hematology = byCategory.hematology;
    
    // Group by panel
    const byPanel = {};
    hematology.forEach(r => {
      const panel = r.panel_name || r.panel_code || 'No Panel';
      if (!byPanel[panel]) {
        byPanel[panel] = [];
      }
      byPanel[panel].push(r);
    });
    
    Object.keys(byPanel).forEach(panelName => {
      console.log(`\n📊 ${panelName.toUpperCase()}`);
      console.log('-'.repeat(80));
      console.log(
        'Test Name'.padEnd(35) + 
        'Result'.padEnd(15) + 
        'Range'.padEnd(20) + 
        'Unit'.padEnd(10)
      );
      console.log('-'.repeat(80));
      
      byPanel[panelName].forEach(r => {
        const testName = (r.test_name || r.test_code || 'Unknown').padEnd(35);
        const result = String(r.value || '-').padEnd(15);
        const range = (r.reference_range || '-').padEnd(20);
        const unit = (r.unit || '-').padEnd(10);
        
        let flag = '';
        if (r.flag === 'high' || r.flag === 'critical_high') flag = ' ↑';
        if (r.flag === 'low' || r.flag === 'critical_low') flag = ' ↓';
        
        console.log(`${testName}${result}${range}${unit}${flag}`);
      });
      
      console.log(`\nTotal tests in ${panelName}: ${byPanel[panelName].length}`);
    });
  }
  
  // Calculate space needed
  console.log('\n' + '='.repeat(80));
  console.log('PRINT LAYOUT CALCULATION');
  console.log('='.repeat(80));
  
  if (byCategory.hematology) {
    const hematology = byCategory.hematology;
    const panelCount = new Set(hematology.map(r => r.panel_name || r.panel_code)).size;
    
    console.log('\nEstimated space needed (in mm):');
    console.log('  Report Header: ~13mm');
    console.log('  Patient Info: ~18mm');
    console.log('  Category Heading: ~7mm');
    console.log(`  Panel Headers: ~${panelCount * 4}mm (${panelCount} panels)`);
    console.log('  Column Headers: ~4mm');
    console.log(`  Test Rows: ~${hematology.length * 3}mm (${hematology.length} tests × 3mm)`);
    console.log('  Verification: ~13mm');
    console.log('  Footer: ~18mm');
    
    const total = 13 + 18 + 7 + (panelCount * 4) + 4 + (hematology.length * 3) + 13 + 18;
    console.log(`  TOTAL: ~${total}mm`);
    console.log(`\nA4 available height: 275mm (297mm - 22mm margins)`);
    console.log(`Space remaining: ${275 - total}mm`);
    
    if (total > 275) {
      console.log('\n⚠️  WARNING: Content may overflow to second page!');
      console.log(`   Need to reduce by: ${total - 275}mm`);
    } else {
      console.log('\n✅ Content should fit on one page');
    }
  }
}
