# Test Result Data Structure

## Overview
Test results are stored in the `results` collection in MongoDB. Each result represents a single test result for a specific order.

## Database Schema

### Results Collection
```typescript
{
  _id: ObjectId,                    // Auto-generated MongoDB ID
  orderId: ObjectId,                // REQUIRED - References orders collection
  orderTestId: ObjectId,            // OPTIONAL - References order_tests collection
  testCode: string,                 // REQUIRED - Test code (e.g., "WBC", "HB", "ALT")
  testName: string,                 // REQUIRED - Full test name
  panelCode: string,                // OPTIONAL - Panel code (e.g., "FBC", "LFT")
  panelName: string,                // OPTIONAL - Panel name (e.g., "Full Blood Count")
  value: string,                    // REQUIRED - The test result value
  unit: string,                     // OPTIONAL - Unit of measurement (e.g., "g/dL", "U/L")
  referenceRange: string,           // OPTIONAL - Normal range (e.g., "12-16", "< 5.0")
  flag: enum,                       // REQUIRED - normal | low | high | critical_low | critical_high
  status: enum,                     // REQUIRED - preliminary | verified | amended
  comments: string,                 // OPTIONAL - Additional notes
  resultedAt: Date,                 // REQUIRED - When result was entered
  resultedBy: ObjectId,             // OPTIONAL - User who entered result
  verifiedAt: Date,                 // OPTIONAL - When result was verified
  verifiedBy: ObjectId,             // OPTIONAL - User who verified result
  amendedFrom: ObjectId,            // OPTIONAL - Original result if amended
  amendmentReason: string,          // OPTIONAL - Reason for amendment
  createdAt: Date,                  // Auto-generated
  updatedAt: Date                   // Auto-generated
}
```

## API Endpoints

### Create Single Result
**POST** `/results`

```json
{
  "orderId": "69bd1c1d103c77dbc6305713",
  "orderTestId": "69bd1c1e103c77dbc6305715",
  "testCode": "WBC",
  "testName": "White Blood Cell Count",
  "panelCode": "FBC",
  "panelName": "Full Blood Count",
  "value": "7.5",
  "unit": "x10⁹/L",
  "referenceRange": "4.0-11.0",
  "flag": "normal"
}
```

### Create Bulk Results (RECOMMENDED - Much Faster!)
**POST** `/results/bulk`

```json
[
  {
    "orderId": "69bd1c1d103c77dbc6305713",
    "orderTestId": "69bd1c1e103c77dbc6305715",
    "testCode": "WBC",
    "testName": "White Blood Cell Count",
    "value": "7.5",
    "unit": "x10⁹/L",
    "referenceRange": "4.0-11.0",
    "flag": "normal"
  },
  {
    "orderId": "69bd1c1d103c77dbc6305713",
    "orderTestId": "69bd1c1e103c77dbc6305716",
    "testCode": "RBC",
    "testName": "Red Blood Cell Count",
    "value": "4.8",
    "unit": "x10¹²/L",
    "referenceRange": "4.5-5.5",
    "flag": "normal"
  }
]
```

## Result Flags

- `normal` - Value within reference range
- `low` - Value below reference range
- `high` - Value above reference range
- `critical_low` - Value critically below reference range (requires immediate attention)
- `critical_high` - Value critically above reference range (requires immediate attention)

## Result Status

- `preliminary` - Result entered but not yet verified
- `verified` - Result has been verified by authorized personnel
- `amended` - Result has been corrected/amended

## Test Value Types

### Numeric Tests
Most tests have numeric values:
```json
{
  "testCode": "HB",
  "value": "13.5",
  "unit": "g/dL",
  "referenceRange": "12-16"
}
```

### Qualitative Tests
Some tests have text values:
```json
{
  "testCode": "URINE-COLOR",
  "value": "Yellow",
  "unit": null,
  "referenceRange": null
}
```

### Semi-Quantitative Tests
Tests with graded results:
```json
{
  "testCode": "URINE-PROTEIN",
  "value": "+2",
  "unit": null,
  "referenceRange": "Negative"
}
```

### Reactive/Non-Reactive Tests
Immunoassay tests:
```json
{
  "testCode": "HIV",
  "value": "Non-Reactive",
  "unit": null,
  "referenceRange": "Non-Reactive"
}
```

## Common Test Categories

### Hematology (FBC)
- WBC, RBC, HB, HCT, MCV, MCH, MCHC, PLT, etc.
- Units: x10⁹/L, x10¹²/L, g/dL, %, fL, pg

### Clinical Chemistry
- **Liver Function**: ALT, AST, ALP, TBIL, DBIL, ALB, TP, GGT
- **Renal Function**: UREA, CREAT, UA, NA, K, CL, HCO3
- **Lipid Profile**: CHOL, TG, HDL, LDL, VLDL
- Units: U/L, mg/dL, mmol/L, g/dL

### Urinalysis
- **Physical**: URINE-COLOR, URINE-CLARITY, URINE-SG, URINE-PH
- **Chemical**: URINE-PROTEIN, URINE-GLUCOSE, URINE-KETONES, URINE-BLOOD
- **Microscopy**: URINE-RBC, URINE-WBC, URINE-EPI, URINE-CASTS

### Immunoassay/Serology
- HIV, HBSAG, HCV, VDRL, etc.
- Values: Reactive/Non-Reactive, Positive/Negative

## Performance Notes

### Single Create vs Bulk Create
- **Single Create**: Makes one API call per result (slow for multiple results)
- **Bulk Create**: Makes one API call for all results (10-20x faster)

Example timing for 25 results:
- Single create: ~5-10 seconds (25 API calls)
- Bulk create: ~0.5-1 second (1 API call)

**Always use bulk create when entering multiple results!**

## Frontend Integration

### Using Bulk Create Hook
```typescript
import { useCreateBulkResults } from '@/hooks/useResults';

const createBulkResults = useCreateBulkResults();

const results = [
  { orderId, testCode: 'WBC', testName: 'White Blood Cell Count', value: '7.5', ... },
  { orderId, testCode: 'RBC', testName: 'Red Blood Cell Count', value: '4.8', ... },
  // ... more results
];

await createBulkResults.mutateAsync(results);
```

## Data Validation

### Required Fields
- `orderId` - Must be valid MongoDB ObjectId
- `testCode` - Must match test catalog
- `testName` - Full test name
- `value` - Result value as string
- `flag` - Must be one of: normal, low, high, critical_low, critical_high

### Optional but Recommended
- `orderTestId` - Links result to specific order test
- `panelCode` - Groups tests by panel
- `panelName` - Panel display name
- `unit` - Unit of measurement
- `referenceRange` - For comparison and flagging

## Auto-Verification

All results are automatically verified when created:
- `status` is set to `verified`
- `verifiedAt` is set to current timestamp
- `verifiedBy` is set to the user who entered the result

This eliminates the need for a separate verification step.
