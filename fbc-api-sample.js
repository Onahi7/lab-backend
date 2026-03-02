#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function loadEnvFile() {
  try {
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) {
      return;
    }

    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        return;
      }

      const [key, ...valueParts] = trimmed.split('=');
      if (!key || valueParts.length === 0) {
        return;
      }

      const value = valueParts.join('=').trim();
      if (!process.env[key.trim()]) {
        process.env[key.trim()] = value;
      }
    });
  } catch {
    // Ignore env file parsing errors and fall back to process env defaults.
  }
}

loadEnvFile();

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const API_EMAIL = process.env.API_EMAIL || 'admin@lab.com';
const API_PASSWORD = process.env.API_PASSWORD || 'Admin@2026';
const SAMPLE_OUTPUT_FILE = process.env.FBC_SAMPLE_OUTPUT || 'fbc-report-sample.json';

const SAMPLE_PATIENT = {
  firstName: 'Sample',
  lastName: 'FBC Patient',
  age: 32,
  gender: 'F',
  phone: '+23277000000',
  address: 'Freetown',
};

const SAMPLE_FBC_VALUES = {
  HB: '13.8',
  HCT: '41.5',
  RBC: '4.62',
  WBC: '6.70',
  PLT: '248',
  MCV: '89.8',
  MCH: '29.9',
  MCHC: '33.2',
  RDW: '12.9',
  NEUT: '56.4',
  LYMPH: '34.2',
  MONO: '6.1',
  EOS: '2.7',
  BASO: '0.6',
};

async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const response = await fetch(url, options);
  const text = await response.text();

  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!response.ok) {
    const message = typeof body === 'object' && body !== null
      ? body.message || JSON.stringify(body)
      : body || `HTTP ${response.status}`;
    throw new Error(`${options.method || 'GET'} ${endpoint} failed: ${message}`);
  }

  return body;
}

function buildAuthHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function login() {
  const auth = await apiRequest('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: API_EMAIL,
      password: API_PASSWORD,
    }),
  });

  if (!auth?.accessToken) {
    throw new Error('Login did not return an accessToken');
  }

  return auth;
}

function findFbcPanel(panels) {
  if (!Array.isArray(panels)) {
    return null;
  }

  return (
    panels.find((panel) => panel.code === 'FBC') ||
    panels.find((panel) => `${panel.name || ''}`.toLowerCase().includes('full blood')) ||
    null
  );
}

function buildOrderTestsFromPanel(fbcPanel) {
  const panelTests = Array.isArray(fbcPanel?.tests) ? fbcPanel.tests : [];

  if (panelTests.length === 0) {
    throw new Error('FBC panel has no component tests');
  }

  return panelTests.map((item) => ({
    testId: String(item.testId || ''),
    testCode: item.testCode,
    testName: item.testName,
    price: 0,
    panelCode: fbcPanel.code,
    panelName: fbcPanel.name,
  }));
}

function resolveResultValue(testCode) {
  if (Object.prototype.hasOwnProperty.call(SAMPLE_FBC_VALUES, testCode)) {
    return SAMPLE_FBC_VALUES[testCode];
  }

  return '0';
}

function printCreatedResults(results) {
  console.log('\nCreated + verified FBC results:\n');
  const rows = results.map((item) => ({
    testCode: item.testCode,
    testName: item.testName,
    value: item.value,
    flag: item.flag,
    status: item.status,
  }));
  console.table(rows);
}

function printReportSummary(report) {
  console.log('\nFBC report summary:\n');
  console.log(`Report Number : ${report?.reportMetadata?.reportNumber || 'N/A'}`);
  console.log(`Patient       : ${report?.patientInfo?.fullName || 'N/A'}`);
  console.log(`Order Number  : ${report?.orderInfo?.orderNumber || 'N/A'}`);
  console.log(`Category Count: ${Array.isArray(report?.resultsByCategory) ? report.resultsByCategory.length : 0}`);

  const flatResults = [];
  for (const category of report?.resultsByCategory || []) {
    for (const result of category.results || []) {
      flatResults.push({
        category: category.categoryDisplayName || category.category,
        code: result.testCode,
        name: result.testName,
        value: result.value,
        range: result.referenceRange || '-',
        unit: result.unit || '-',
        flag: result.flag,
      });
    }
  }

  console.log('\nReport result rows:\n');
  console.table(flatResults);
}

async function run() {
  console.log('Starting FBC API sample flow...');
  console.log(`API Base URL: ${API_BASE_URL}`);

  const auth = await login();
  const token = auth.accessToken;
  console.log(`Authenticated as: ${auth.user?.email || API_EMAIL}`);

  const patient = await apiRequest('/patients', {
    method: 'POST',
    headers: buildAuthHeaders(token),
    body: JSON.stringify(SAMPLE_PATIENT),
  });
  console.log(`Patient created: ${patient.patientId || patient._id}`);

  const panels = await apiRequest('/test-panels?activeOnly=true', {
    method: 'GET',
    headers: buildAuthHeaders(token),
  });

  const fbcPanel = findFbcPanel(panels);
  if (!fbcPanel) {
    throw new Error('FBC panel was not found in /test-panels');
  }

  const orderTests = buildOrderTestsFromPanel(fbcPanel);
  const order = await apiRequest('/orders', {
    method: 'POST',
    headers: buildAuthHeaders(token),
    body: JSON.stringify({
      patientId: patient._id,
      tests: orderTests,
      priority: 'routine',
    }),
  });
  console.log(`Order created: ${order.orderNumber}`);

  const orderTestItems = await apiRequest(`/orders/${order._id}/tests`, {
    method: 'GET',
    headers: buildAuthHeaders(token),
  });

  const orderTestsByCode = new Map(
    (orderTestItems || []).map((item) => [item.testCode, item]),
  );

  const createdResults = [];
  for (const test of orderTests) {
    const mappedOrderTest = orderTestsByCode.get(test.testCode);
    const created = await apiRequest('/results', {
      method: 'POST',
      headers: buildAuthHeaders(token),
      body: JSON.stringify({
        orderId: order._id,
        orderTestId: mappedOrderTest?._id,
        testCode: test.testCode,
        testName: test.testName,
        value: resolveResultValue(test.testCode),
        comments: 'Sample FBC result created by script',
      }),
    });

    const verified = await apiRequest(`/results/${created._id}/verify`, {
      method: 'POST',
      headers: buildAuthHeaders(token),
    });

    createdResults.push(verified);
  }

  printCreatedResults(createdResults);

  const report = await apiRequest(`/reports/lab-results/${order._id}`, {
    method: 'GET',
    headers: buildAuthHeaders(token),
  });

  printReportSummary(report);

  const outputPath = path.join(__dirname, SAMPLE_OUTPUT_FILE);
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');

  console.log(`\nSaved full report payload to: ${outputPath}`);
  console.log('FBC API sample flow completed successfully.');
}

run().catch((error) => {
  console.error('\nFBC API sample flow failed.');
  console.error(error.message);
  process.exit(1);
});