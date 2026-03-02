#!/usr/bin/env node

/**
 * Database Test Parameters and Ranges Verification Script
 * 
 * This script checks the MongoDB database to verify which tests have:
 * - Reference ranges (legacy simple ranges)
 * - Comprehensive reference ranges (age/gender-specific)
 * 
 * Usage:
 *   node check-test-parameters.js
 * 
 * Requirements:
 *   - MongoDB must be running
 *   - MONGODB_URI environment variable must be set (or use default)
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
    // Silently fail if .env doesn't exist
  }
}

// Load .env file
loadEnvFile();

// MongoDB connection URI from environment or default
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/lis';

// Define the Test Catalog Schema (simplified version)
const TestCatalogSchema = new mongoose.Schema({
  code: String,
  name: String,
  category: String,
  sampleType: String,
  price: Number,
  unit: String,
  referenceRange: String,
  referenceRanges: Array,
  turnaroundTime: Number,
  machineId: mongoose.Schema.Types.ObjectId,
  isActive: Boolean,
  description: String,
}, { 
  timestamps: true, 
  collection: 'test_catalog' 
});

const TestCatalog = mongoose.model('TestCatalog', TestCatalogSchema);

// Console colors for better output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function colorize(text, color) {
  return `${color}${text}${colors.reset}`;
}

async function checkTestParameters() {
  try {
    console.log(colorize('\n==============================================', colors.cyan));
    console.log(colorize('  TEST PARAMETERS & RANGES VERIFICATION', colors.cyan));
    console.log(colorize('==============================================\n', colors.cyan));
    
    console.log(`Connecting to MongoDB: ${MONGODB_URI.replace(/\/\/.*@/, '//***@')}`);
    await mongoose.connect(MONGODB_URI);
    console.log(colorize('✓ Connected to MongoDB successfully\n', colors.green));

    // Fetch all tests
    const tests = await TestCatalog.find({}).lean();
    
    if (tests.length === 0) {
      console.log(colorize('⚠ No tests found in database!', colors.yellow));
      console.log('  Make sure to seed the database first.\n');
      return;
    }

    console.log(colorize(`Found ${tests.length} tests in database\n`, colors.bright));

    // Categorize tests
    const testsWithComprehensiveRanges = [];
    const testsWithSimpleRanges = [];
    const testsWithNoRanges = [];
    const testsByCategory = {};

    tests.forEach(test => {
      // Categorize by type of ranges
      if (test.referenceRanges && Array.isArray(test.referenceRanges) && test.referenceRanges.length > 0) {
        testsWithComprehensiveRanges.push(test);
      } else if (test.referenceRange) {
        testsWithSimpleRanges.push(test);
      } else {
        testsWithNoRanges.push(test);
      }

      // Count by category
      if (!testsByCategory[test.category]) {
        testsByCategory[test.category] = {
          total: 0,
          withComprehensive: 0,
          withSimple: 0,
          withNone: 0,
        };
      }
      testsByCategory[test.category].total++;
      if (test.referenceRanges && Array.isArray(test.referenceRanges) && test.referenceRanges.length > 0) {
        testsByCategory[test.category].withComprehensive++;
      } else if (test.referenceRange) {
        testsByCategory[test.category].withSimple++;
      } else {
        testsByCategory[test.category].withNone++;
      }
    });

    // Display summary
    console.log(colorize('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.blue));
    console.log(colorize('  SUMMARY', colors.blue));
    console.log(colorize('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', colors.blue));
    
    console.log(`${colorize('Total Tests:', colors.bright)} ${tests.length}`);
    console.log(`${colorize('Tests with Comprehensive Ranges:', colors.green)} ${testsWithComprehensiveRanges.length} (${((testsWithComprehensiveRanges.length / tests.length) * 100).toFixed(1)}%)`);
    console.log(`${colorize('Tests with Simple Ranges:', colors.yellow)} ${testsWithSimpleRanges.length} (${((testsWithSimpleRanges.length / tests.length) * 100).toFixed(1)}%)`);
    console.log(`${colorize('Tests with NO Ranges:', colors.red)} ${testsWithNoRanges.length} (${((testsWithNoRanges.length / tests.length) * 100).toFixed(1)}%)`);

    // Display by category
    console.log(colorize('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.blue));
    console.log(colorize('  BREAKDOWN BY CATEGORY', colors.blue));
    console.log(colorize('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', colors.blue));

    Object.keys(testsByCategory).sort().forEach(category => {
      const stats = testsByCategory[category];
      console.log(colorize(`${category.toUpperCase()}:`, colors.bright));
      console.log(`  Total: ${stats.total}`);
      console.log(`  ${colorize('●', colors.green)} Comprehensive: ${stats.withComprehensive}`);
      console.log(`  ${colorize('●', colors.yellow)} Simple: ${stats.withSimple}`);
      console.log(`  ${colorize('●', colors.red)} None: ${stats.withNone}`);
      console.log('');
    });

    // Display tests with no ranges
    if (testsWithNoRanges.length > 0) {
      console.log(colorize('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.red));
      console.log(colorize('  ⚠ TESTS MISSING REFERENCE RANGES', colors.red));
      console.log(colorize('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', colors.red));
      
      testsWithNoRanges.forEach(test => {
        console.log(`  ${colorize('✗', colors.red)} ${test.code} - ${test.name}`);
        console.log(`    Category: ${test.category}`);
        console.log(`    Unit: ${test.unit || 'N/A'}`);
        console.log('');
      });
    }

    // Sample of tests with comprehensive ranges
    if (testsWithComprehensiveRanges.length > 0) {
      console.log(colorize('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.green));
      console.log(colorize('  ✓ SAMPLE: TESTS WITH COMPREHENSIVE RANGES', colors.green));
      console.log(colorize('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', colors.green));
      
      const samplesToShow = Math.min(5, testsWithComprehensiveRanges.length);
      for (let i = 0; i < samplesToShow; i++) {
        const test = testsWithComprehensiveRanges[i];
        console.log(`  ${colorize('✓', colors.green)} ${colorize(test.code, colors.bright)} - ${test.name}`);
        console.log(`    Category: ${test.category}`);
        console.log(`    Unit: ${test.unit || 'N/A'}`);
        console.log(`    Number of ranges: ${test.referenceRanges.length}`);
        
        // Show first range as example
        if (test.referenceRanges.length > 0) {
          const range = test.referenceRanges[0];
          console.log(`    Example range:`);
          if (range.ageGroup) console.log(`      Age Group: ${range.ageGroup}`);
          if (range.gender && range.gender !== 'all') console.log(`      Gender: ${range.gender}`);
          if (range.condition) console.log(`      Condition: ${range.condition}`);
          console.log(`      Range: ${range.range}${range.unit ? ' ' + range.unit : ''}`);
          if (range.criticalLow || range.criticalHigh) {
            console.log(`      Critical: ${range.criticalLow || '-'} to ${range.criticalHigh || '-'}`);
          }
        }
        console.log('');
      }
      
      if (testsWithComprehensiveRanges.length > samplesToShow) {
        console.log(colorize(`  ... and ${testsWithComprehensiveRanges.length - samplesToShow} more tests\n`, colors.dim));
      }
    }

    // Detailed test list option
    console.log(colorize('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.cyan));
    console.log(colorize('  COMPLETE TEST LIST', colors.cyan));
    console.log(colorize('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', colors.cyan));

    const allTests = [...testsWithComprehensiveRanges, ...testsWithSimpleRanges, ...testsWithNoRanges];
    allTests.sort((a, b) => a.code.localeCompare(b.code));

    console.log(`${'Code'.padEnd(15)} ${'Name'.padEnd(40)} ${'Category'.padEnd(15)} ${'Ranges'}`);
    console.log('─'.repeat(100));
    
    allTests.forEach(test => {
      let rangeStatus = '';
      let statusColor = colors.reset;
      
      if (test.referenceRanges && test.referenceRanges.length > 0) {
        rangeStatus = `Comprehensive (${test.referenceRanges.length})`;
        statusColor = colors.green;
      } else if (test.referenceRange) {
        rangeStatus = 'Simple';
        statusColor = colors.yellow;
      } else {
        rangeStatus = 'None';
        statusColor = colors.red;
      }

      const code = test.code.padEnd(15);
      const name = test.name.substring(0, 39).padEnd(40);
      const category = test.category.padEnd(15);
      
      console.log(`${code} ${name} ${category} ${colorize(rangeStatus, statusColor)}`);
    });

    console.log(colorize('\n==============================================\n', colors.cyan));

  } catch (error) {
    console.error(colorize(`\n✗ Error: ${error.message}`, colors.red));
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log(colorize('Disconnected from MongoDB\n', colors.dim));
  }
}

// Run the script
checkTestParameters().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
