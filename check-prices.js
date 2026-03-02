#!/usr/bin/env node

/**
 * Check Test Prices from Database
 */

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Simple .env file loader
function loadEnvFile() {
  try {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      envContent.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, ...valueParts] = trimmed.split('=');
          if (key && valueParts.length > 0) {
            const value = valueParts.join('=').trim();
            process.env[key.trim()] = value;
          }
        }
      });
    }
  } catch (error) {
    // Silently fail
  }
}

loadEnvFile();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/lis';

const TestCatalogSchema = new mongoose.Schema({
  code: String,
  name: String,
  category: String,
  price: Number,
  isActive: Boolean,
}, { 
  timestamps: true, 
  collection: 'test_catalog' 
});

const TestPanelSchema = new mongoose.Schema({
  code: String,
  name: String,
  tests: Array,
  price: Number,
  isActive: Boolean,
}, { 
  timestamps: true, 
  collection: 'test_panels' 
});

const TestCatalog = mongoose.model('TestCatalog', TestCatalogSchema);
const TestPanel = mongoose.model('TestPanel', TestPanelSchema);

async function checkPrices() {
  try {
    console.log(`Connecting to: ${MONGODB_URI.replace(/\/\/.*@/, '//***@')}`);
    await mongoose.connect(MONGODB_URI);
    console.log('✓ Connected\n');

    // Get all tests
    const tests = await TestCatalog.find({}).sort({ category: 1, code: 1 }).lean();
    
    // Get all panels
    const panels = await TestPanel.find({}).sort({ code: 1 }).lean();

    // Group by category
    const byCategory = {};
    tests.forEach(test => {
      if (!byCategory[test.category]) {
        byCategory[test.category] = [];
      }
      byCategory[test.category].push(test);
    });

    console.log('='.repeat(80));
    console.log('TEST PRICES BY CATEGORY');
    console.log('='.repeat(80));
    console.log();

    let totalTests = 0;
    let totalValue = 0;

    Object.keys(byCategory).sort().forEach(category => {
      const categoryTests = byCategory[category];
      console.log(`\n${category.toUpperCase()}:`);
      console.log('-'.repeat(80));
      console.log(`${'Code'.padEnd(12)} ${'Name'.padEnd(45)} ${'Price'.padStart(10)}`);
      console.log('-'.repeat(80));
      
      let categoryTotal = 0;
      categoryTests.forEach(test => {
        const code = test.code.padEnd(12);
        const name = test.name.substring(0, 44).padEnd(45);
        const price = `Le ${test.price.toLocaleString()}`.padStart(10);
        console.log(`${code} ${name} ${price}`);
        categoryTotal += test.price;
        totalTests++;
        totalValue += test.price;
      });
      
      console.log('-'.repeat(80));
      console.log(`Subtotal (${categoryTests.length} tests):`.padEnd(69) + `Le ${categoryTotal.toLocaleString()}`.padStart(10));
    });

    // Show panels
    if (panels.length > 0) {
      console.log('\n\n' + '='.repeat(80));
      console.log('TEST PANELS');
      console.log('='.repeat(80));
      console.log();
      console.log(`${'Code'.padEnd(12)} ${'Name'.padEnd(35)} ${'Tests'.padStart(8)} ${'Price'.padStart(10)}`);
      console.log('-'.repeat(80));
      
      panels.forEach(panel => {
        const code = panel.code.padEnd(12);
        const name = panel.name.substring(0, 34).padEnd(35);
        const testCount = `${panel.tests.length}`.padStart(8);
        const price = `Le ${panel.price.toLocaleString()}`.padStart(10);
        console.log(`${code} ${name} ${testCount} ${price}`);
      });
    }

    console.log('\n' + '='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total Individual Tests: ${totalTests}`);
    console.log(`Total Test Panels: ${panels.length}`);
    console.log(`Average Test Price: Le ${Math.round(totalValue / totalTests).toLocaleString()}`);
    console.log(`Total Catalog Value: Le ${totalValue.toLocaleString()}`);
    console.log('='.repeat(80));
    console.log();

    // Price distribution
    const priceRanges = {
      'Under Le 100': tests.filter(t => t.price < 100).length,
      'Le 100-200': tests.filter(t => t.price >= 100 && t.price < 200).length,
      'Le 200-500': tests.filter(t => t.price >= 200 && t.price < 500).length,
      'Le 500-1000': tests.filter(t => t.price >= 500 && t.price < 1000).length,
      'Le 1000+': tests.filter(t => t.price >= 1000).length,
    };

    console.log('\nPRICE DISTRIBUTION:');
    Object.entries(priceRanges).forEach(([range, count]) => {
      const percentage = ((count / totalTests) * 100).toFixed(1);
      console.log(`  ${range.padEnd(20)} ${count.toString().padStart(3)} tests (${percentage}%)`);
    });
    console.log();

  } catch (error) {
    console.error(`✗ Error: ${error.message}`);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

checkPrices();
