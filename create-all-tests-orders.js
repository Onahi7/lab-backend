/**
 * Create orders with ALL available tests from ALL panels
 */

const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb+srv://mmmnigeriaschool12_db_user:Iamhardy_7*@cluster0.abdi7yt.mongodb.net/carefaamlab?retryWrites=true&w=majority&appName=Cluster0&ssl=true&authSource=admin';

const patients = [
  {
    firstName: 'Aminata',
    lastName: 'Kamara',
    gender: 'F',
    dateOfBirth: new Date(Date.now() - (28 * 365 * 24 * 60 * 60 * 1000)), // 28 years
    age: 28,
    phoneNumber: '+232-76-555-6666',
    email: 'aminata.kamara@example.com',
  },
  {
    firstName: 'Mohamed',
    lastName: 'Sesay',
    gender: 'M',
    dateOfBirth: new Date(Date.now() - (45 * 365 * 24 * 60 * 60 * 1000)), // 45 years
    age: 45,
    phoneNumber: '+232-76-777-8888',
    email: 'mohamed.sesay@example.com',
  },
];

function findReferenceRange(test, age, gender) {
  if (!test.referenceRanges || test.referenceRanges.length === 0) {
    return {
      range: test.referenceRange || 'N/A',
      unit: test.unit || '',
      criticalLow: null,
      criticalHigh: null,
    };
  }

  const match = test.referenceRanges.find(r => {
    const ageMatch = age >= (r.ageMin || 0) && age <= (r.ageMax || 999);
    const genderMatch = !r.gender || r.gender === 'all' || r.gender === gender;
    return ageMatch && genderMatch;
  });

  return match || test.referenceRanges[0];
}

function generateValue(refRange, forceAbnormal = false, testCode = '') {
  // Handle qualitative tests (urinalysis)
  const qualitativeTests = {
    'URINE-COLOR': ['Yellow', 'Pale Yellow', 'Dark Yellow', 'Amber'],
    'URINE-CLARITY': ['Clear', 'Slightly Cloudy', 'Cloudy', 'Turbid'],
    'URINE-PROTEIN': ['Negative', 'Trace', '+1', '+2', '+3', '+4'],
    'URINE-GLUCOSE': ['Negative', 'Trace', '+1', '+2', '+3', '+4'],
    'URINE-KETONES': ['Negative', 'Trace', 'Small', 'Moderate', 'Large'],
    'URINE-BLOOD': ['Negative', 'Trace', 'Small', 'Moderate', 'Large'],
    'URINE-BILI': ['Negative', 'Small', 'Moderate', 'Large'],
    'URINE-NITRITE': ['Negative', 'Positive'],
    'URINE-LE': ['Negative', 'Trace', 'Small', 'Moderate', 'Large'],
    'URINE-EPI': ['Few', 'Moderate', 'Many'],
    'URINE-CASTS': ['None', 'Hyaline (0-2)', 'Few Hyaline', 'Many Hyaline', 'Granular', 'Cellular'],
    'URINE-CRYSTALS': ['None', 'Few', 'Moderate', 'Many'],
    'URINE-BACTERIA': ['None', 'Few', 'Moderate', 'Many'],
  };

  // Immunoassay qualitative results
  const immunoassayQualitative = {
    'HIV': ['Non-Reactive', 'Reactive'],
    'HBV': ['Non-Reactive', 'Reactive'],
    'HCV': ['Non-Reactive', 'Reactive'],
    'VDRL': ['Non-Reactive', 'Reactive'],
    'TPHA': ['Non-Reactive', 'Reactive'],
    'PREG': ['Negative', 'Positive'],
    'MALARIA': ['Negative', 'Positive'],
    'TYPHOID': ['Negative', 'Positive'],
  };

  // Check if this is a qualitative test
  if (qualitativeTests[testCode]) {
    const options = qualitativeTests[testCode];
    // Usually return normal (first option), occasionally abnormal
    if (forceAbnormal && Math.random() > 0.85) {
      return options[Math.floor(Math.random() * (options.length - 1)) + 1];
    }
    return options[0];
  }

  if (immunoassayQualitative[testCode]) {
    const options = immunoassayQualitative[testCode];
    // Usually negative/non-reactive, occasionally positive
    if (forceAbnormal && Math.random() > 0.9) {
      return options[1];
    }
    return options[0];
  }

  // Numeric tests
  const rangeStr = (refRange.range || '').replace(/[<>]/g, '').trim();
  const parts = rangeStr.split('-').map(v => parseFloat(v.trim()));
  
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    const [min, max] = parts;
    const mid = (min + max) / 2;
    const range = max - min;
    
    // Randomly make some values abnormal
    if (forceAbnormal && Math.random() > 0.7) {
      if (Math.random() > 0.5) {
        // High
        return Math.round((max + range * 0.3) * 100) / 100;
      } else {
        // Low
        return Math.round((min - range * 0.3) * 100) / 100;
      }
    }
    
    // Normal value
    const value = mid + (range * (Math.random() - 0.5) * 0.6);
    return Math.round(value * 100) / 100;
  }
  
  return parts[0] || 10;
}

function calculateFlag(value, refRange) {
  const numValue = parseFloat(value);
  if (isNaN(numValue)) return 'normal';

  const rangeStr = (refRange.range || '').replace(/[<>]/g, '').trim();
  const parts = rangeStr.split('-').map(v => parseFloat(v.trim()));
  
  if (parts.length !== 2) return 'normal';

  const [min, max] = parts;

  if (refRange.criticalLow && numValue < parseFloat(refRange.criticalLow)) return 'critical_low';
  if (refRange.criticalHigh && numValue > parseFloat(refRange.criticalHigh)) return 'critical_high';
  if (numValue < min) return 'low';
  if (numValue > max) return 'high';
  
  return 'normal';
}

async function main() {
  try {
    console.log('🔌 Connecting...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected\n');

    const db = mongoose.connection.db;

    // Get ALL test panels
    const allPanels = await db.collection('test_panels').find({}).toArray();
    console.log(`✅ Found ${allPanels.length} test panels:\n`);
    
    allPanels.forEach(panel => {
      console.log(`   📋 ${panel.name} (${panel.code}) - ${panel.tests.length} tests`);
    });
    console.log('');

    // Collect all unique test IDs from all panels
    const allTestIds = new Set();
    const panelMap = {};
    
    for (const panel of allPanels) {
      panelMap[panel.code] = panel;
      panel.tests.forEach(t => {
        allTestIds.add(t.testId.toString());
      });
    }

    // Fetch all test details
    const testObjectIds = Array.from(allTestIds).map(id => new mongoose.Types.ObjectId(id));
    const allTests = await db.collection('test_catalog').find({
      _id: { $in: testObjectIds }
    }).toArray();

    console.log(`✅ Loaded ${allTests.length} unique tests from database\n`);

    // Group tests by category
    const testsByCategory = {};
    allTests.forEach(test => {
      const cat = test.category || 'other';
      if (!testsByCategory[cat]) {
        testsByCategory[cat] = [];
      }
      testsByCategory[cat].push(test);
    });

    console.log('📊 Tests by category:');
    Object.keys(testsByCategory).forEach(cat => {
      console.log(`   ${cat}: ${testsByCategory[cat].length} tests`);
    });
    console.log('');

    // Create patients
    console.log('👥 Creating patients...');
    const patientIds = [];
    for (const patient of patients) {
      const patientId = `P${Date.now()}${Math.floor(Math.random() * 10000)}`;
      const result = await db.collection('patients').findOneAndUpdate(
        { firstName: patient.firstName, lastName: patient.lastName },
        { $set: { ...patient, patientId } },
        { upsert: true, returnDocument: 'after' }
      );
      patientIds.push(result._id);
      console.log(`✅ ${patient.firstName} ${patient.lastName} (${patient.age} years, ${patient.gender})`);
    }
    console.log('');

    // Create orders with ALL tests
    const orders = [];
    for (let i = 0; i < patientIds.length; i++) {
      const patient = patients[i];
      
      const order = {
        patientId: patientIds[i],
        orderNumber: `ORD-${Date.now()}-${i}`,
        orderDate: new Date(),
        status: 'completed',
        tests: allTests.map(t => t.code),
        panels: allPanels.map(p => p.code),
        order_tests: allTests.map(t => ({
          testCode: t.code,
          testName: t.name,
          category: t.category,
          sampleType: t.sampleType,
          price: t.price,
        })),
        totalAmount: allPanels.reduce((sum, p) => sum + (p.price || 0), 0),
        paidAmount: allPanels.reduce((sum, p) => sum + (p.price || 0), 0),
        paymentStatus: 'paid',
        paymentMethod: 'cash',
        createdBy: new mongoose.Types.ObjectId(),
      };

      const inserted = await db.collection('orders').insertOne(order);
      orders.push({ ...order, _id: inserted.insertedId });

      console.log(`\n${'═'.repeat(100)}`);
      console.log(`📊 ${patient.firstName} ${patient.lastName} - ${order.orderNumber}`);
      console.log('═'.repeat(100));

      let abnormalCount = 0;
      const resultsByCategory = {};

      // Generate results for all tests
      for (const test of allTests) {
        const refRange = findReferenceRange(test, patient.age, patient.gender);
        const value = generateValue(refRange, true, test.code); // Pass test code for qualitative handling
        const flag = calculateFlag(value, refRange);

        if (flag !== 'normal') abnormalCount++;

        // Find which panel this test belongs to
        let testPanelName = null;
        let testPanelCode = null;
        for (const panel of allPanels) {
          const testInPanel = panel.tests.find(t => t.testId.toString() === test._id.toString());
          if (testInPanel) {
            testPanelName = panel.name;
            testPanelCode = panel.code;
            break;
          }
        }

        await db.collection('results').insertOne({
          orderId: inserted.insertedId,
          testCode: test.code,
          testName: test.name,
          panelName: testPanelName,
          panelCode: testPanelCode,
          panel_name: testPanelName,
          panel_code: testPanelCode,
          category: test.category,
          value: typeof value === 'string' ? value : value.toString(),
          unit: refRange.unit || test.unit || '',
          referenceRange: refRange.range || '',
          flag,
          status: 'verified',
          enteredBy: new mongoose.Types.ObjectId(),
          enteredAt: new Date(),
          verifiedBy: new mongoose.Types.ObjectId(),
          verifiedAt: new Date(),
        });

        const cat = test.category || 'other';
        if (!resultsByCategory[cat]) {
          resultsByCategory[cat] = [];
        }
        resultsByCategory[cat].push({ test, value, flag, refRange, panelName: testPanelName });
      }

      // Display results by category
      for (const [category, results] of Object.entries(resultsByCategory)) {
        console.log(`\n🧪 ${category.toUpperCase()}`);
        console.log('─'.repeat(100));
        
        // Group by panel within category
        const byPanel = {};
        results.forEach(r => {
          const panel = r.panelName || 'Other';
          if (!byPanel[panel]) byPanel[panel] = [];
          byPanel[panel].push(r);
        });
        
        for (const [panelName, panelResults] of Object.entries(byPanel)) {
          if (Object.keys(byPanel).length > 1) {
            console.log(`\n  📋 ${panelName}`);
          }
          
          for (const { test, value, flag, refRange } of panelResults) {
            const emoji = { normal: '✅', low: '⬇️ ', high: '⬆️ ', critical_low: '🔴', critical_high: '🔴' };
            const prefix = Object.keys(byPanel).length > 1 ? '     ' : '';
            console.log(`${prefix}${emoji[flag]} ${test.code.padEnd(10)} ${test.name.padEnd(45)} ${value.toString().padStart(10)} ${(refRange.unit || test.unit || '').padEnd(10)} (${refRange.range || 'N/A'})`);
          }
        }
      }

      console.log(`\n📈 Total: ${allTests.length} tests | Abnormal: ${abnormalCount}`);
    }

    console.log('\n' + '═'.repeat(100));
    console.log('✅ Orders created successfully!\n');
    console.log('📝 Summary:');
    console.log(`   • Total Panels: ${allPanels.length}`);
    console.log(`   • Total Unique Tests: ${allTests.length}`);
    console.log(`   • Patients: ${patients.length}`);
    console.log(`   • Orders: ${orders.length}`);
    console.log(`   • Total Results: ${allTests.length * orders.length}\n`);
    console.log('🖨️  View reports at:');
    orders.forEach((o, i) => {
      console.log(`\n   ${i + 1}. ${patients[i].firstName} ${patients[i].lastName} (${patients[i].age} years)`);
      console.log(`      Order: ${o.orderNumber}`);
      console.log(`      http://localhost:8080/lab/reports/${o._id}`);
      console.log(`      http://localhost:8080/reception/reports/${o._id}`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected');
  }
}

main();
