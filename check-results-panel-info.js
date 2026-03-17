/**
 * Check Results Panel Information
 * Analyzes existing results in the database to see which have panel codes/names
 */

const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb+srv://mmmnigeriaschool12_db_user:Iamhardy_7*@cluster0.abdi7yt.mongodb.net/carefaamlab?retryWrites=true&w=majority&appName=Cluster0&ssl=true&authSource=admin';

async function main() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;

    // Get all results
    const allResults = await db.collection('results').find({}).toArray();
    console.log(`📊 Total Results in Database: ${allResults.length}\n`);

    if (allResults.length === 0) {
      console.log('⚠️  No results found in database');
      return;
    }

    // Analyze panel information
    const withPanelCode = allResults.filter(r => r.panelCode);
    const withPanelName = allResults.filter(r => r.panelName);
    const withEither = allResults.filter(r => r.panelCode || r.panelName);
    const withBoth = allResults.filter(r => r.panelCode && r.panelName);
    const withNeither = allResults.filter(r => !r.panelCode && !r.panelName);

    console.log('═'.repeat(80));
    console.log('PANEL INFORMATION ANALYSIS');
    console.log('═'.repeat(80));
    console.log(`\n✅ Results with panelCode:        ${withPanelCode.length} (${((withPanelCode.length/allResults.length)*100).toFixed(1)}%)`);
    console.log(`✅ Results with panelName:        ${withPanelName.length} (${((withPanelName.length/allResults.length)*100).toFixed(1)}%)`);
    console.log(`✅ Results with either:           ${withEither.length} (${((withEither.length/allResults.length)*100).toFixed(1)}%)`);
    console.log(`✅ Results with both:             ${withBoth.length} (${((withBoth.length/allResults.length)*100).toFixed(1)}%)`);
    console.log(`❌ Results with neither:          ${withNeither.length} (${((withNeither.length/allResults.length)*100).toFixed(1)}%)`);

    // Group by panel
    console.log('\n' + '═'.repeat(80));
    console.log('RESULTS GROUPED BY PANEL');
    console.log('═'.repeat(80));

    const panelGroups = {};
    allResults.forEach(result => {
      const key = result.panelCode || result.panelName || 'NO_PANEL';
      if (!panelGroups[key]) {
        panelGroups[key] = {
          panelCode: result.panelCode,
          panelName: result.panelName,
          count: 0,
          testCodes: new Set(),
          orderIds: new Set(),
        };
      }
      panelGroups[key].count++;
      panelGroups[key].testCodes.add(result.testCode);
      panelGroups[key].orderIds.add(result.orderId?.toString());
    });

    const sortedPanels = Object.entries(panelGroups).sort((a, b) => b[1].count - a[1].count);

    sortedPanels.forEach(([key, data]) => {
      console.log(`\n📋 ${key === 'NO_PANEL' ? '⚠️  NO PANEL INFO' : key}`);
      if (data.panelCode) console.log(`   Code: ${data.panelCode}`);
      if (data.panelName) console.log(`   Name: ${data.panelName}`);
      console.log(`   Results: ${data.count}`);
      console.log(`   Unique Tests: ${data.testCodes.size}`);
      console.log(`   Orders: ${data.orderIds.size}`);
    });

    // Sample results without panel info
    if (withNeither.length > 0) {
      console.log('\n' + '═'.repeat(80));
      console.log('SAMPLE RESULTS WITHOUT PANEL INFO (First 5)');
      console.log('═'.repeat(80));

      const samples = withNeither.slice(0, 5);
      for (const result of samples) {
        console.log(`\n🔍 Result ID: ${result._id}`);
        console.log(`   Order ID: ${result.orderId}`);
        console.log(`   Test Code: ${result.testCode}`);
        console.log(`   Test Name: ${result.testName}`);
        console.log(`   Value: ${result.value}`);
        console.log(`   Status: ${result.status}`);
        console.log(`   Created: ${result.createdAt}`);
      }
    }

    // Check orders with results
    console.log('\n' + '═'.repeat(80));
    console.log('ORDERS WITH RESULTS');
    console.log('═'.repeat(80));

    const uniqueOrderIds = [...new Set(allResults.map(r => r.orderId?.toString()).filter(Boolean))];
    console.log(`\n📦 Total Orders with Results: ${uniqueOrderIds.length}\n`);

    // Sample a few orders
    const sampleOrderIds = uniqueOrderIds.slice(0, 3);
    for (const orderId of sampleOrderIds) {
      const order = await db.collection('orders').findOne({ _id: new mongoose.Types.ObjectId(orderId) });
      const orderResults = allResults.filter(r => r.orderId?.toString() === orderId);
      
      if (order) {
        const patient = await db.collection('patients').findOne({ _id: order.patientId });
        console.log(`\n📋 Order: ${order.orderNumber}`);
        console.log(`   Patient: ${patient?.firstName} ${patient?.lastName}`);
        console.log(`   Status: ${order.status}`);
        console.log(`   Results: ${orderResults.length}`);
        
        const panelInfo = orderResults.filter(r => r.panelCode || r.panelName);
        console.log(`   Results with panel info: ${panelInfo.length}/${orderResults.length}`);
        
        if (panelInfo.length > 0) {
          const panels = [...new Set(panelInfo.map(r => r.panelCode || r.panelName))];
          console.log(`   Panels: ${panels.join(', ')}`);
        }
      }
    }

    // Check test catalog for panel information
    console.log('\n' + '═'.repeat(80));
    console.log('TEST CATALOG PANEL INFORMATION');
    console.log('═'.repeat(80));

    const testCatalog = await db.collection('test_catalog').find({}).toArray();
    const catalogWithPanel = testCatalog.filter(t => t.panelCode || t.panelName);
    
    console.log(`\n📚 Total Tests in Catalog: ${testCatalog.length}`);
    console.log(`✅ Tests with panel info: ${catalogWithPanel.length} (${((catalogWithPanel.length/testCatalog.length)*100).toFixed(1)}%)`);

    // Group catalog by panel
    const catalogPanels = {};
    testCatalog.forEach(test => {
      const key = test.panelCode || test.panelName || 'NO_PANEL';
      if (!catalogPanels[key]) {
        catalogPanels[key] = {
          panelCode: test.panelCode,
          panelName: test.panelName,
          tests: [],
        };
      }
      catalogPanels[key].tests.push(test.code);
    });

    console.log('\n📋 Panels in Test Catalog:');
    Object.entries(catalogPanels).sort((a, b) => b[1].tests.length - a[1].tests.length).forEach(([key, data]) => {
      console.log(`\n   ${key === 'NO_PANEL' ? '⚠️  NO PANEL' : key}`);
      if (data.panelCode) console.log(`      Code: ${data.panelCode}`);
      if (data.panelName) console.log(`      Name: ${data.panelName}`);
      console.log(`      Tests: ${data.tests.length}`);
    });

    console.log('\n' + '═'.repeat(80));
    console.log('RECOMMENDATIONS');
    console.log('═'.repeat(80));

    if (withNeither.length > 0) {
      console.log('\n⚠️  ACTION NEEDED:');
      console.log(`   ${withNeither.length} results don't have panel information`);
      console.log('   These results will still display correctly but without panel headings');
      console.log('\n💡 To fix this:');
      console.log('   1. Ensure test_catalog has panelCode/panelName for all tests');
      console.log('   2. When creating results, copy panel info from test_catalog');
      console.log('   3. Consider running a migration script to backfill panel info');
    } else {
      console.log('\n✅ All results have panel information!');
      console.log('   Reports will display panel headings correctly');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

main();
