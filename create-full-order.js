/**
 * Script to create a full order with FBC, RFT, LFT, Electrolytes, Malaria, 
 * Hepatitis B, Hepatitis C, VDRL, Widal, Blood Group, Sickle Cell Screen
 * for patient "Sample FBC Patient" — enter realistic results and verify them.
 */

const http = require('http');

const API = 'http://127.0.0.1:3000';
const PATIENT_ID = '69a47e2fc900895f4327ff50'; // Sample FBC Patient

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  // 1. Login
  console.log('🔐 Logging in...');
  const loginResp = await request('POST', '/auth/login', {
    email: 'admin@lab.com',
    password: 'Admin@2026',
  });
  const token = loginResp.data.accessToken;
  console.log('✅ Logged in');

  // 2. Fetch test catalog to get actual testIds
  console.log('📚 Fetching test catalog...');
  const catalogResp = await request('GET', '/test-catalog', null, token);
  const catalog = catalogResp.data;
  const catalogMap = {};
  for (const t of catalog) {
    catalogMap[t.code] = t;
  }
  console.log(`✅ ${catalog.length} tests in catalog`);

  // Define which tests we want, grouped by panel
  // BUN -> UREA, ICa -> CA (matching catalog codes)
  // FBC tests ordered to match Zybio ZS-2 analyzer / seed-test-panels.ts order
  const wantedTests = [
    // FBC Panel (all 25 tests in seed order)
    { code: 'WBC', panelCode: 'FBC', panelName: 'Full Blood Count' },
    { code: 'NEUTA', panelCode: 'FBC', panelName: 'Full Blood Count' },
    { code: 'LYMPHA', panelCode: 'FBC', panelName: 'Full Blood Count' },
    { code: 'MONOA', panelCode: 'FBC', panelName: 'Full Blood Count' },
    { code: 'EOSA', panelCode: 'FBC', panelName: 'Full Blood Count' },
    { code: 'BASOA', panelCode: 'FBC', panelName: 'Full Blood Count' },
    { code: 'NEUT', panelCode: 'FBC', panelName: 'Full Blood Count' },
    { code: 'LYMPH', panelCode: 'FBC', panelName: 'Full Blood Count' },
    { code: 'MONO', panelCode: 'FBC', panelName: 'Full Blood Count' },
    { code: 'EOS', panelCode: 'FBC', panelName: 'Full Blood Count' },
    { code: 'BASO', panelCode: 'FBC', panelName: 'Full Blood Count' },
    { code: 'RBC', panelCode: 'FBC', panelName: 'Full Blood Count' },
    { code: 'HB', panelCode: 'FBC', panelName: 'Full Blood Count' },
    { code: 'HCT', panelCode: 'FBC', panelName: 'Full Blood Count' },
    { code: 'MCV', panelCode: 'FBC', panelName: 'Full Blood Count' },
    { code: 'MCH', panelCode: 'FBC', panelName: 'Full Blood Count' },
    { code: 'MCHC', panelCode: 'FBC', panelName: 'Full Blood Count' },
    { code: 'RDWCV', panelCode: 'FBC', panelName: 'Full Blood Count' },
    { code: 'RDWSD', panelCode: 'FBC', panelName: 'Full Blood Count' },
    { code: 'PLT', panelCode: 'FBC', panelName: 'Full Blood Count' },
    { code: 'MPV', panelCode: 'FBC', panelName: 'Full Blood Count' },
    { code: 'PDW', panelCode: 'FBC', panelName: 'Full Blood Count' },
    { code: 'PLTCT', panelCode: 'FBC', panelName: 'Full Blood Count' },
    { code: 'PLCC', panelCode: 'FBC', panelName: 'Full Blood Count' },
    { code: 'PLCR', panelCode: 'FBC', panelName: 'Full Blood Count' },
    // RFT Panel
    { code: 'UREA', panelCode: 'RFT', panelName: 'Renal Function Test' },
    { code: 'CREAT', panelCode: 'RFT', panelName: 'Renal Function Test' },
    { code: 'UA', panelCode: 'RFT', panelName: 'Renal Function Test' },
    // LFT Panel
    { code: 'TBIL', panelCode: 'LFT', panelName: 'Liver Function Test' },
    { code: 'DBIL', panelCode: 'LFT', panelName: 'Liver Function Test' },
    { code: 'AST', panelCode: 'LFT', panelName: 'Liver Function Test' },
    { code: 'ALT', panelCode: 'LFT', panelName: 'Liver Function Test' },
    { code: 'ALP', panelCode: 'LFT', panelName: 'Liver Function Test' },
    { code: 'GGT', panelCode: 'LFT', panelName: 'Liver Function Test' },
    { code: 'TP', panelCode: 'LFT', panelName: 'Liver Function Test' },
    { code: 'ALB', panelCode: 'LFT', panelName: 'Liver Function Test' },
    // Electrolytes Panel
    { code: 'K', panelCode: 'ELEC', panelName: 'Electrolyte Panel' },
    { code: 'NA', panelCode: 'ELEC', panelName: 'Electrolyte Panel' },
    { code: 'CL', panelCode: 'ELEC', panelName: 'Electrolyte Panel' },
    { code: 'CA', panelCode: 'ELEC', panelName: 'Electrolyte Panel' },
    { code: 'TCO2', panelCode: 'ELEC', panelName: 'Electrolyte Panel' },
    // Serology / Microbiology
    { code: 'MALARIA' },
    { code: 'HBSAG' },
    { code: 'HCV' },
    { code: 'VDRL' },
    { code: 'WIDAL' },
    { code: 'HIV' },
    // Hematology extras
    { code: 'BLOODGROUP' },
    { code: 'SICKLE' },
    { code: 'ESR' },
  ];

  // Build the order tests array with real testIds from catalog
  const orderTests = [];
  for (const w of wantedTests) {
    const cat = catalogMap[w.code];
    if (!cat) {
      console.warn(`  ⚠️ Test ${w.code} not found in catalog, skipping`);
      continue;
    }
    orderTests.push({
      testId: cat._id,
      testCode: cat.code,
      testName: cat.name,
      price: cat.price || 0,
      ...(w.panelCode ? { panelCode: w.panelCode, panelName: w.panelName } : {}),
    });
  }
  console.log(`📋 ${orderTests.length} tests prepared for order`);

  // 3. Create order
  console.log('📋 Creating order...');
  const orderResp = await request('POST', '/orders', {
    patientId: PATIENT_ID,
    referredByDoctor: 'Dr. Ibrahim',
    tests: orderTests,
    priority: 'routine',
    initialPayments: [{ paymentMethod: 'cash', amount: 1000 }],
  }, token);
  
  if (orderResp.status !== 201) {
    console.error('❌ Failed to create order:', JSON.stringify(orderResp.data, null, 2));
    process.exit(1);
  }
  
  const order = orderResp.data;
  const orderId = order._id;
  console.log(`✅ Order created: ${order.orderNumber} (ID: ${orderId})`);

  // 4. Get order tests to have their IDs
  const orderTestsResp = await request('GET', `/orders/${orderId}/tests`, null, token);
  const createdTests = orderTestsResp.data;
  console.log(`📊 ${createdTests.length} order tests created`);

  // Build a testCode -> orderTest map
  const testMap = {};
  for (const ot of createdTests) {
    testMap[ot.testCode] = ot;
  }

  // 5. Define realistic results (some abnormal for arrow demo)
  const results = [
    // FBC - Female 32yo, all 25 tests in seed order
    // WBC=12.80 → absolute counts computed from percentages
    { testCode: 'WBC', value: '12.80', unit: 'x10⁹/L', flag: 'high' },   // HIGH (normal 4.0-11.0)
    { testCode: 'NEUTA', value: '9.25', unit: 'x10⁹/L', flag: 'high' },  // HIGH (WBC*72.3%, normal 2.0-7.0)
    { testCode: 'LYMPHA', value: '2.37', unit: 'x10⁹/L', flag: 'normal' },
    { testCode: 'MONOA', value: '0.74', unit: 'x10⁹/L', flag: 'normal' },
    { testCode: 'EOSA', value: '0.37', unit: 'x10⁹/L', flag: 'normal' },
    { testCode: 'BASOA', value: '0.06', unit: 'x10⁹/L', flag: 'normal' },
    { testCode: 'NEUT', value: '72.3', unit: '%', flag: 'high' },         // HIGH (normal 40-70)
    { testCode: 'LYMPH', value: '18.5', unit: '%', flag: 'low' },         // LOW (normal 20-40)
    { testCode: 'MONO', value: '5.8', unit: '%', flag: 'normal' },
    { testCode: 'EOS', value: '2.9', unit: '%', flag: 'normal' },
    { testCode: 'BASO', value: '0.5', unit: '%', flag: 'normal' },
    { testCode: 'RBC', value: '3.82', unit: 'x10¹²/L', flag: 'low' },    // LOW (normal 4.1-5.1)
    { testCode: 'HB', value: '10.2', unit: 'g/dL', flag: 'low' },        // LOW (normal 12-16)
    { testCode: 'HCT', value: '31.5', unit: '%', flag: 'low' },           // LOW (normal 36-48)
    { testCode: 'MCV', value: '82.5', unit: 'fL', flag: 'normal' },
    { testCode: 'MCH', value: '26.7', unit: 'pg', flag: 'low' },          // LOW (normal 27-32)
    { testCode: 'MCHC', value: '32.4', unit: 'g/L', flag: 'normal' },
    { testCode: 'RDWCV', value: '14.8', unit: '%', flag: 'high' },        // HIGH (normal 11.5-14.5)
    { testCode: 'RDWSD', value: '46.2', unit: 'fL', flag: 'normal' },
    { testCode: 'PLT', value: '285', unit: 'x10⁹/L', flag: 'normal' },
    { testCode: 'MPV', value: '9.8', unit: 'fL', flag: 'normal' },
    { testCode: 'PDW', value: '12.3', unit: 'fL', flag: 'normal' },
    { testCode: 'PLTCT', value: '0.28', unit: '%', flag: 'normal' },
    { testCode: 'PLCC', value: '68', unit: 'x10⁹/L', flag: 'normal' },
    { testCode: 'PLCR', value: '23.8', unit: '%', flag: 'normal' },

    // RFT
    { testCode: 'UREA', value: '28.5', unit: 'mg/dL', flag: 'high' },    // HIGH (normal 15-45 → actually normal, but we keep high)
    { testCode: 'CREAT', value: '1.8', unit: 'mg/dL', flag: 'high' },    // HIGH (normal 0.6-1.2)
    { testCode: 'UA', value: '5.1', unit: 'mg/dL', flag: 'normal' },

    // LFT
    { testCode: 'TBIL', value: '0.9', unit: 'mg/dL', flag: 'normal' },
    { testCode: 'DBIL', value: '0.2', unit: 'mg/dL', flag: 'normal' },
    { testCode: 'AST', value: '52', unit: 'U/L', flag: 'high' },         // HIGH (normal 10-40)
    { testCode: 'ALT', value: '48', unit: 'U/L', flag: 'high' },         // HIGH (normal 7-56 but some ranges 7-40)
    { testCode: 'ALP', value: '95', unit: 'U/L', flag: 'normal' },
    { testCode: 'GGT', value: '35', unit: 'U/L', flag: 'normal' },
    { testCode: 'TP', value: '7.2', unit: 'g/dL', flag: 'normal' },
    { testCode: 'ALB', value: '3.2', unit: 'g/dL', flag: 'low' },        // LOW (normal 3.5-5.0)

    // Electrolytes
    { testCode: 'K', value: '5.8', unit: 'mmol/L', flag: 'high' },       // HIGH (normal 3.5-5.2)
    { testCode: 'NA', value: '141.6', unit: 'mmol/L', flag: 'normal' },
    { testCode: 'CL', value: '110.2', unit: 'mmol/L', flag: 'high' },    // HIGH (normal 96-108)
    { testCode: 'CA', value: '9.2', unit: 'mg/dL', flag: 'normal' },
    { testCode: 'TCO2', value: '18.5', unit: 'mmol/L', flag: 'low' },    // LOW (normal 22-30)

    // Serology (interpretation results)
    { testCode: 'MALARIA', value: 'Negative', comments: 'Negative' },
    { testCode: 'HBSAG', value: 'Non-reactive', comments: 'Non-reactive' },
    { testCode: 'HCV', value: 'Non-reactive', comments: 'Non-reactive' },
    { testCode: 'VDRL', value: 'Non-reactive', comments: 'Non-reactive' },
    { testCode: 'WIDAL', value: 'Negative', comments: 'Negative' },
    { testCode: 'HIV', value: 'Non-reactive', comments: 'Non-reactive' },

    // Hematology extras
    { testCode: 'BLOODGROUP', value: 'O+', comments: 'O Positive' },
    { testCode: 'SICKLE', value: 'AA', comments: 'AA' },
    { testCode: 'ESR', value: '25', unit: 'mm/hr', flag: 'high' },       // HIGH for female (normal 0-20)
  ];

  // 6. Submit all results
  console.log('🔬 Entering results...');
  const resultIds = [];
  for (const r of results) {
    const orderTest = testMap[r.testCode];
    if (!orderTest) {
      console.warn(`  ⚠️ No order test found for ${r.testCode}, skipping`);
      continue;
    }
    
    const resultBody = {
      orderId: orderId,
      orderTestId: orderTest._id,
      testCode: r.testCode,
      testName: orderTest.testName,
      value: r.value,
      ...(r.unit ? { unit: r.unit } : {}),
      ...(r.flag ? { flag: r.flag } : {}),
      ...(r.comments ? { comments: r.comments } : {}),
    };

    const resResp = await request('POST', '/results', resultBody, token);
    if (resResp.status === 201) {
      resultIds.push(resResp.data._id);
      const flag = resResp.data.flag || 'normal';
      const arrow = flag === 'high' || flag === 'critical_high' ? '↑' : flag === 'low' || flag === 'critical_low' ? '↓' : ' ';
      console.log(`  ✅ ${r.testCode.padEnd(12)} ${r.value.padStart(8)} ${arrow} ${flag}`);
    } else {
      console.error(`  ❌ ${r.testCode}: ${JSON.stringify(resResp.data)}`);
    }
  }

  // 7. Verify all results
  console.log('\n✔️ Verifying all results...');
  let verified = 0;
  for (const id of resultIds) {
    const verifyResp = await request('POST', `/results/${id}/verify`, {}, token);
    if (verifyResp.status === 200 || verifyResp.status === 201) {
      verified++;
    } else {
      console.error(`  ❌ Failed to verify ${id}: ${JSON.stringify(verifyResp.data)}`);
    }
  }
  console.log(`✅ ${verified}/${resultIds.length} results verified`);

  // 8. Summary
  console.log('\n========================================');
  console.log(`📋 ORDER: ${order.orderNumber}`);
  console.log(`🆔 ORDER ID: ${orderId}`);
  console.log(`👤 PATIENT: Sample FBC Patient (F, 32yo)`);
  console.log(`🩺 DOCTOR: Dr. Ibrahim`);
  console.log(`📊 TESTS: ${results.length} results entered`);
  console.log(`✅ VERIFIED: ${verified} results`);
  console.log(`\n🖨️  VIEW REPORT AT:`);
  console.log(`   http://localhost:8080/lab/reports/${orderId}`);
  console.log('========================================');
}

main().catch(console.error);
