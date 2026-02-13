# Lab Results Report Template

## Overview

The Lab Results Report Template feature provides a professional, printable report format for laboratory test results. The report includes patient demographics, test results grouped by category, verification information, and laboratory branding.

## Features

- **Professional Layout**: Medical-grade report format with proper structure and branding
- **Result Grouping**: Tests organized by category (Chemistry, Hematology, Immunoassay, etc.)
- **Visual Indicators**: Color-coded flags and arrow indicators for abnormal results
- **Print & PDF Export**: Browser-native print functionality with optimized layout
- **Verification Section**: Signature blocks and verification timestamps
- **Legal Compliance**: Disclaimers, accreditation info, and confidentiality notices
- **Responsive Design**: Viewable on desktop, tablet, and mobile devices

## API Endpoint

### Get Lab Result Report

**Endpoint:** `GET /api/reports/lab-results/:orderId`

**Authentication:** Required (JWT)

**Authorization:** Admin, Lab Technician, Receptionist

**Parameters:**
- `orderId` (path parameter): MongoDB ObjectId of the order

**Response:**
```json
{
  "reportMetadata": {
    "reportId": "RPT-ORD-20240211-0001",
    "generatedAt": "2024-02-11T10:30:00Z",
    "generatedBy": "user123"
  },
  "patientInfo": {
    "patientId": "PAT-001",
    "fullName": "John Doe",
    "age": 35,
    "dateOfBirth": "1989-01-15",
    "gender": "M",
    "mrn": "MRN-12345",
    "phone": "+234-123-456-7890",
    "address": "123 Main St, Lagos"
  },
  "orderInfo": {
    "orderNumber": "ORD-20240211-0001",
    "orderDate": "2024-02-11T08:00:00Z",
    "collectedAt": "2024-02-11T08:30:00Z",
    "reportedAt": "2024-02-11T10:00:00Z",
    "priority": "routine",
    "orderingPhysician": "Dr. Jane Smith"
  },
  "resultsByCategory": [
    {
      "category": "chemistry",
      "categoryDisplayName": "Clinical Chemistry / Electrolytes",
      "results": [
        {
          "testCode": "GLU",
          "testName": "Glucose",
          "value": "95",
          "unit": "mg/dL",
          "referenceRange": "70-100",
          "flag": "normal",
          "resultedAt": "2024-02-11T09:30:00Z",
          "isAmended": false
        }
      ]
    }
  ],
  "verificationInfo": {
    "performedBy": "John Tech",
    "verifiedBy": "Dr. Medical Director",
    "verifiedAt": "2024-02-11T10:00:00Z"
  },
  "laboratoryInfo": {
    "name": "CareFaam Clinical Laboratory",
    "address": "123 Medical Center Drive, Lagos, Nigeria",
    "phone": "+234-123-456-7890",
    "email": "lab@carefaam.com",
    "website": "https://carefaam.com",
    "licenseNumber": "LAB-2024-001",
    "accreditation": "ISO 15189:2012 Accredited"
  }
}
```

**Error Responses:**

- `400 Bad Request`: Invalid order ID format or no verified results available
- `401 Unauthorized`: Missing or invalid authentication token
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: Order not found
- `500 Internal Server Error`: Server error

## Configuration

Laboratory information is configured via environment variables in `.env`:

```bash
# Laboratory Information (for reports)
LAB_NAME=CareFaam Clinical Laboratory
LAB_LOGO_URL=https://example.com/logo.png
LAB_ADDRESS=123 Medical Center Drive, Lagos, Nigeria
LAB_PHONE=+234-123-456-7890
LAB_EMAIL=lab@carefaam.com
LAB_WEBSITE=https://carefaam.com
LAB_LICENSE_NUMBER=LAB-2024-001
LAB_ACCREDITATION=ISO 15189:2012 Accredited
```

## Frontend Usage

### Viewing a Report

Navigate to `/lab/reports/:orderId` to view a report for a specific order.

### From Results Page

Click the "View Report" button (file icon) in the results table to open the report for that order.

### Programmatic Usage

```typescript
import { LabResultReport } from '@/components/reports';

function MyComponent() {
  return <LabResultReport orderId="order123" />;
}
```

### Using the Hook

```typescript
import { useLabReport } from '@/hooks/useLabReport';

function MyComponent() {
  const { reportData, loading, error, refetch } = useLabReport(orderId);
  
  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  
  return <div>{/* Use reportData */}</div>;
}
```

## Printing

### Browser Print

Click the "Print Report" button to open the browser print dialog. The report is optimized for A4/Letter paper size.

### PDF Export

Click the "Export PDF" button to save the report as a PDF using the browser's print-to-PDF functionality.

### Print Styles

The report includes print-specific CSS that:
- Hides UI controls (buttons, navigation)
- Optimizes layout for paper output
- Ensures colors print correctly
- Prevents page breaks in critical sections
- Sets appropriate margins and page size

## Result Flags and Styling

Results are color-coded based on their flag:

- **Normal**: Black text
- **Low/High**: Orange text with ↓/↑ arrow
- **Critical Low/High**: Red bold text with ↓/↑ arrow

## Test Categories

Results are grouped into the following categories:

1. Clinical Chemistry / Electrolytes
2. Hematology
3. Immunoassay
4. Urinalysis
5. Microbiology
6. Other Tests

Categories appear in this order and only if they contain results.

## Security

- JWT authentication required
- Role-based access control (Admin, Lab Tech, Receptionist)
- Audit logging of all report generation requests
- Only verified or amended results are included

## Troubleshooting

### Report Not Loading

- Verify the order ID is valid
- Ensure the order has verified results
- Check authentication token is valid
- Verify user has appropriate role

### Print Issues

- Use Chrome or Edge for best print results
- Ensure "Background graphics" is enabled in print settings
- Try exporting to PDF first, then print the PDF

### Missing Laboratory Information

- Check environment variables are set in `.env`
- Restart the backend server after changing `.env`
- Verify configuration is loaded correctly

## Development

### Adding New Fields

1. Update DTOs in `backend/src/reports/dto/`
2. Update service method in `backend/src/reports/reports.service.ts`
3. Update frontend types in `frontend/src/hooks/useLabReport.ts`
4. Update components to display new fields

### Customizing Layout

Edit the component files in `frontend/src/components/reports/`:
- `ReportHeader.tsx` - Header and branding
- `PatientInfoSection.tsx` - Patient demographics
- `ResultsSection.tsx` - Results display
- `VerificationSection.tsx` - Signatures
- `ReportFooter.tsx` - Footer and disclaimers

### Styling

The report uses TailwindCSS for styling. Print-specific styles are in the `<style>` tag in `LabResultReport.tsx`.

## Future Enhancements

- Demographic-specific reference ranges (age/gender)
- Custom report templates per laboratory
- Batch report generation
- Email delivery of reports
- Digital signatures
- QR code for report verification
- Multi-language support
