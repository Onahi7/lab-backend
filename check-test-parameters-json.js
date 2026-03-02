#!/usr/bin/env node

/**
 * Database Test Parameters and Ranges Verification Script (JSON Export)
 * 
 * This script checks the MongoDB database and exports results to JSON
 * 
 * Usage:
 *   node check-test-parameters-json.js [output-file.json]
 * 
 * Default output: test-parameters-report.json
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
const outputFile = process.argv[2] || 'test-parameters-report.json';

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

async function generateReport() {
  try {
    console.log(`Connecting to: ${MONGODB_URI.replace(/\/\/.*@/, '//***@')}`);
    await mongoose.connect(MONGODB_URI);
    console.log('✓ Connected\n');

    const tests = await TestCatalog.find({}).lean();
    
    if (tests.length === 0) {
      console.log('⚠ No tests found in database!');
      process.exit(1);
    }

    const report = {
      generatedAt: new Date().toISOString(),
      database: MONGODB_URI.split('/').pop().split('?')[0],
      summary: {
        totalTests: tests.length,
        withComprehensiveRanges: 0,
        withSimpleRanges: 0,
        withNoRanges: 0,
      },
      byCategory: {},
      tests: [],
      testsWithNoRanges: [],
    };

    tests.forEach(test => {
      let rangeType = 'none';
      let rangeCount = 0;

      if (test.referenceRanges && Array.isArray(test.referenceRanges) && test.referenceRanges.length > 0) {
        rangeType = 'comprehensive';
        rangeCount = test.referenceRanges.length;
        report.summary.withComprehensiveRanges++;
      } else if (test.referenceRange) {
        rangeType = 'simple';
        rangeCount = 1;
        report.summary.withSimpleRanges++;
      } else {
        report.summary.withNoRanges++;
        report.testsWithNoRanges.push({
          code: test.code,
          name: test.name,
          category: test.category,
          unit: test.unit,
        });
      }

      // Category stats
      if (!report.byCategory[test.category]) {
        report.byCategory[test.category] = {
          total: 0,
          withComprehensive: 0,
          withSimple: 0,
          withNone: 0,
        };
      }
      report.byCategory[test.category].total++;
      if (rangeType === 'comprehensive') report.byCategory[test.category].withComprehensive++;
      else if (rangeType === 'simple') report.byCategory[test.category].withSimple++;
      else report.byCategory[test.category].withNone++;

      // Test details
      report.tests.push({
        code: test.code,
        name: test.name,
        category: test.category,
        unit: test.unit,
        rangeType,
        rangeCount,
        hasReferenceRanges: !!test.referenceRanges,
        referenceRangesCount: test.referenceRanges?.length || 0,
        hasSimpleRange: !!test.referenceRange,
        simpleRange: test.referenceRange || null,
        isActive: test.isActive,
      });
    });

    // Sort tests by code
    report.tests.sort((a, b) => a.code.localeCompare(b.code));
    report.testsWithNoRanges.sort((a, b) => a.code.localeCompare(b.code));

    // Write to file
    const outputPath = path.resolve(outputFile);
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));

    console.log('✓ Report generated successfully\n');
    console.log('Summary:');
    console.log(`  Total Tests: ${report.summary.totalTests}`);
    console.log(`  With Comprehensive Ranges: ${report.summary.withComprehensiveRanges}`);
    console.log(`  With Simple Ranges: ${report.summary.withSimpleRanges}`);
    console.log(`  With NO Ranges: ${report.summary.withNoRanges}`);
    console.log(`\nReport saved to: ${outputPath}\n`);

  } catch (error) {
    console.error(`✗ Error: ${error.message}`);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

generateReport();
