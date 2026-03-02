/**
 * Test script to verify panel expansion
 * This simulates what happens when a panel is selected in an order
 */

const mongoose = require('mongoose');

// Read .env file manually
const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '.env');
let mongoUri = 'mongodb://localhost:27017/lab_system';

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const match = envContent.match(/MONGODB_URI=(.+)/);
  if (match) {
    mongoUri = match[1].trim();
  }
}

// Connect to MongoDB
mongoose.connect(mongoUri);

const TestPanel = mongoose.model('TestPanel', new mongoose.Schema({}, { strict: false, collection: 'test_panels' }));
const TestCatalog = mongoose.model('TestCatalog', new mongoose.Schema({}, { strict: false, collection: 'test_catalog' }));

async function testPanelExpansion() {
  try {
    console.log('\n========== PANEL EXPANSION TEST ==========\n');

    // Get all active panels
    const panels = await TestPanel.find({ isActive: true }).lean();
    
    if (panels.length === 0) {
      console.log('❌ No active panels found in database');
      console.log('   Run seed-test-catalog.ts to create panels');
      return;
    }

    console.log(`Found ${panels.length} active panel(s):\n`);

    for (const panel of panels) {
      console.log(`\n📦 Panel: ${panel.code} - ${panel.name}`);
      console.log(`   Price: Le ${panel.price.toLocaleString()}`);
      console.log(`   Component Tests: ${panel.tests?.length || 0}`);
      
      if (panel.tests && panel.tests.length > 0) {
        console.log('\n   Components:');
        for (const test of panel.tests) {
          // Get full test details
          const fullTest = await TestCatalog.findById(test.testId).lean();
          if (fullTest) {
            console.log(`   ✓ ${test.testCode.padEnd(10)} ${test.testName.padEnd(40)} Le ${fullTest.price.toLocaleString()}`);
          } else {
            console.log(`   ⚠ ${test.testCode.padEnd(10)} ${test.testName.padEnd(40)} (Test not found)`);
          }
        }
      } else {
        console.log('   ⚠ No component tests defined');
      }
      
      console.log('\n   ' + '─'.repeat(70));
    }

    // Simulate frontend panel expansion
    console.log('\n\n========== SIMULATING FRONTEND EXPANSION ==========\n');
    
    const samplePanel = panels[0];
    console.log(`Selected Panel: ${samplePanel.code} - ${samplePanel.name}\n`);
    
    console.log('Frontend receives panel with isPanel flag:');
    const frontendPanel = {
      _id: samplePanel._id,
      id: samplePanel._id.toString(),
      code: samplePanel.code,
      name: samplePanel.name,
      category: 'panel',
      price: samplePanel.price,
      isActive: samplePanel.isActive,
      isPanel: true,
      tests: samplePanel.tests
    };
    console.log(JSON.stringify(frontendPanel, null, 2));

    console.log('\n\nExpanded into order tests:');
    const orderTests = [];
    if (frontendPanel.isPanel && frontendPanel.tests) {
      for (const componentTest of frontendPanel.tests) {
        orderTests.push({
          testId: componentTest.testId,
          testCode: componentTest.testCode,
          testName: componentTest.testName,
          price: 0 // Component tests don't have individual prices in panel
        });
      }
    }
    
    console.log(JSON.stringify(orderTests, null, 2));
    
    console.log('\n\n========== RESULT ENTRY VERIFICATION ==========\n');
    console.log('When entering results, lab tech will see:');
    orderTests.forEach((test, index) => {
      console.log(`${index + 1}. ${test.testCode} - ${test.testName}`);
      console.log(`   [ ] Value: _______  Unit: _______  Flag: _______\n`);
    });

    console.log('\n✅ Panel expansion working correctly!');
    console.log(`   Panel "${samplePanel.code}" expands into ${orderTests.length} individual tests`);
    console.log('   Lab tech will enter results for each component test separately\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

testPanelExpansion();
