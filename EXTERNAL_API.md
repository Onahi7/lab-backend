# External Facility API

This API lets another facility or EMR send lab requests, post cashier payments, and pull verified results.

## Authentication

Send the facility API key with every external request:

```http
X-API-Key: lis_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

An admin can create a facility API client with:

```http
POST /external-api/clients
Authorization: Bearer <admin-jwt>
Content-Type: application/json

{
  "facilityName": "City Clinic",
  "contactName": "Front Desk",
  "contactPhone": "+232..."
}
```

The response includes `apiKey` once. Store it in the EMR secret store.

## Catalog

```http
GET /external-api/catalog
X-API-Key: <facility-api-key>
```

Returns active standalone tests and panels. The EMR should submit the `code` values.

## Create Test Request

```http
POST /external-api/test-requests
X-API-Key: <facility-api-key>
Content-Type: application/json

{
  "externalRequestId": "EMR-REQ-10045",
  "patient": {
    "firstName": "Aminata",
    "lastName": "Kamara",
    "age": 34,
    "gender": "F",
    "phone": "+232...",
    "mrn": "EMR-90210"
  },
  "tests": [
    { "code": "FBC" },
    { "code": "RBS" }
  ],
  "priority": "routine",
  "payment": {
    "amount": 150,
    "paymentMethod": "cash"
  },
  "notes": "Requested from City Clinic EMR"
}
```

`externalRequestId` is idempotent per facility. Re-sending the same ID returns the existing lab order.

## Add Cashier Payment

```http
POST /external-api/test-requests/EMR-REQ-10045/payment
X-API-Key: <facility-api-key>
Content-Type: application/json

{
  "amount": 100,
  "paymentMethod": "cash",
  "notes": "Balance paid at partner cashier"
}
```

Supported payment methods are `cash`, `orange_money`, and `afrimoney`.

## Request Status

```http
GET /external-api/test-requests/EMR-REQ-10045
X-API-Key: <facility-api-key>
```

Returns the lab order number, payment status, balance, patient details, and workflow status.

## Results

```http
GET /external-api/test-requests/EMR-REQ-10045/results
X-API-Key: <facility-api-key>
```

Returns result rows against the same patient and request details once results have been entered in the LIS.
