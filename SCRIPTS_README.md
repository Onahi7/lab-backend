# Test Parameters & Ranges Verification Scripts

This directory contains scripts to verify which tests in the database have parameters and reference ranges configured.

## Scripts

### 1. `check-test-parameters.js`
Comprehensive colored console output with detailed information about test coverage.

**Usage:**
```bash
node check-test-parameters.js
```

**Output includes:**
- Summary statistics (total tests, tests with/without ranges)
- Breakdown by category (Hematology, Chemistry, etc.)
- List of tests missing reference ranges
- Sample tests with comprehensive ranges
- Complete test list table

### 2. `check-test-parameters-json.js`
Exports verification results to a JSON file for programmatic use.

**Usage:**
```bash
# Default output: test-parameters-report.json
node check-test-parameters-json.js

# Custom output file
node check-test-parameters-json.js my-report.json
```

**JSON Output Structure:**
```json
{
  "generatedAt": "2026-02-21T...",
  "database": "lis",
  "summary": {
    "totalTests": 78,
    "withComprehensiveRanges": 75,
    "withSimpleRanges": 2,
    "withNoRanges": 1
  },
  "byCategory": {
    "hematology": {
      "total": 14,
      "withComprehensive": 14,
      "withSimple": 0,
      "withNone": 0
    }
  },
  "tests": [...],
  "testsWithNoRanges": [...]
}
```

## Requirements

1. **MongoDB must be running**
   ```bash
   # Check if MongoDB is running
   mongosh --eval "db.version()"
   ```

2. **Environment variables**
   - Ensure `.env` file exists in `/backend` directory
   - `MONGODB_URI` should be set (default: `mongodb://localhost:27017/lis`)

3. **Dependencies**
   ```bash
   # Already installed with the project
   npm install mongoose dotenv
   ```

## Understanding the Output

### Reference Range Types:

1. **Comprehensive Ranges** (Preferred)
   - Age and gender-specific ranges
   - Multiple ranges per test
   - Supports special conditions (pregnancy, menstrual phases)
   - Includes critical values
   - Example: WBC with different ranges for Adult Male, Adult Female, Children, etc.

2. **Simple Ranges** (Legacy)
   - Single reference range string
   - No age/gender differentiation
   - Example: "5.0-10.0"

3. **No Ranges** (Needs Attention)
   - Tests without any reference ranges configured
   - These tests need to be updated in the seed file

## Example Output

```
==============================================
  TEST PARAMETERS & RANGES VERIFICATION
==============================================

Connected to MongoDB: mongodb://localhost:27017/lis
✓ Connected to MongoDB successfully

Found 78 tests in database

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Total Tests: 78
Tests with Comprehensive Ranges: 75 (96.2%)
Tests with Simple Ranges: 2 (2.6%)
Tests with NO Ranges: 1 (1.3%)
```

## Troubleshooting

### Connection Error
```
Error: connect ECONNREFUSED 127.0.0.1:27017
```
**Solution:** Start MongoDB service
```bash
# Windows
net start MongoDB

# Linux/Mac
sudo systemctl start mongod
```

### No Tests Found
```
⚠ No tests found in database!
```
**Solution:** Seed the database
```bash
# In backend directory
npm run seed
# or
pnpm seed
```

### Authentication Error
```
Error: Authentication failed
```
**Solution:** Check `MONGODB_URI` in `.env` file includes correct credentials

## Integration with CI/CD

You can use the JSON export script in your CI/CD pipeline:

```bash
# In your CI script
node check-test-parameters-json.js report.json

# Parse and check for tests without ranges
node -e "
const report = require('./report.json');
if (report.summary.withNoRanges > 0) {
  console.error('❌ Tests without ranges:', report.summary.withNoRanges);
  process.exit(1);
}
console.log('✅ All tests have reference ranges');
"
```

## Notes

- These scripts are read-only and do not modify the database
- They work with the current MongoDB schema (test_catalog collection)
- Scripts can be run anytime without affecting application operations
- Use the colored output script for manual verification
- Use the JSON script for automated checks or reporting
