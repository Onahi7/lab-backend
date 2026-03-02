#!/usr/bin/env node

/**
 * Quick Price Summary
 */

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

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
            process.env[key.trim()] = valueParts.join('=').trim();
          }
        }
      });
    }
  } catch (error) {}
}

loadEnvFile();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/lis';

const TestCatalogSchema = new mongoose.Schema({
  code: String,
  name: String,
  category: String,
  price: Number,
}, { collection: 'test_catalog' });

const TestPanelSchema = new mongoose.Schema({
  code: String,
  name: String,
  price: Number,
}, { collection: 'test_panels' });

async function quickPrices() {
  try {
    await mongoose.connect(MONGODB_URI);
    
    const TestCatalog = mongoose.model('TestCatalog', TestCatalogSchema);
    const TestPanel = mongoose.model('TestPanel', TestPanelSchema);
    
    const tests = await TestCatalog.find({}, 'code name category price').sort({ category: 1, code: 1 }).lean();
    const panels = await TestPanel.find({}, 'code name price').sort({ code: 1 }).lean();
    
    console.log('\n========== TEST PRICES ==========\n');
    
    const byCategory = {};
    tests.forEach(t => {
      if (!byCategory[t.category]) byCategory[t.category] = [];
      byCategory[t.category].push(t);
    });
    
    Object.keys(byCategory).sort().forEach(cat => {
      console.log(`\n${cat.toUpperCase()}:`);
      byCategory[cat].forEach(t => {
        console.log(`  ${t.code.padEnd(10)} ${t.name.padEnd(45)} Le ${t.price.toLocaleString()}`);
      });
    });
    
    if (panels.length > 0) {
      console.log('\n\nTEST PANELS:');
      panels.forEach(p => {
        console.log(`  ${p.code.padEnd(10)} ${p.name.padEnd(45)} Le ${p.price.toLocaleString()}`);
      });
    }
    
    const min = Math.min(...tests.map(t => t.price));
    const max = Math.max(...tests.map(t => t.price));
    const avg = tests.reduce((sum, t) => sum + t.price, 0) / tests.length;
    
    console.log(`\n\nSUMMARY:`);
    console.log(`  Total Tests: ${tests.length}`);
    console.log(`  Total Panels: ${panels.length}`);
    console.log(`  Price Range: Le ${min} - Le ${max.toLocaleString()}`);
    console.log(`  Average: Le ${Math.round(avg).toLocaleString()}`);
    console.log('');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

quickPrices();
