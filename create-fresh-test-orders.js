/**
 * Create fresh orders with unique patients - no reuse
 */

const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb+srv://mmmnigeriaschool12_db_user:Iamhardy_7*@cluster0.abdi7yt.mongodb.net/carefaamlab?retryWrites=true&w=majority&appName=Cluster0&ssl=true&authSource=admin';

// Generate unique timestamp-based names
const timestamp = Date.now();

const patients = [
  {
    firstName: `Test${timestamp}A`,
    lastName: 'Patient',
    gender: 'F',
    dateOfBirth: new Date(Date.now() - (30 * 365 * 24 * 60 * 60 * 1000)), // 30 years
    age: 30,
    phoneNumber: `+232-76-${timestamp.toString().slice(-7)}`,
    email: `test${timestamp}a@example.com`,
  },
  {
    firstName: `Test${timestamp}B`,
    lastName: 'Patient',
    gender: 'M',
    dateOfBirth: new Date(Date.now() - (40 * 365 * 24 * 60 * 60 * 1000)), // 40 years
    age: 40,
    phoneNumber: `+232-77-${timestamp.toString().slice(-7)}`,
    email: `test${timestamp}b@example.com`,
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

function generateValue(refRange, testCode = '') {
  // Handle qualitative tests (urinalysis)
  const qualitativeTests = {
    'URINE-COLOR': ['Yellow', 'Pale Yellow', 'Dark Yellow', 'Amber'],
    'URINE-CLARITY': ['Clear', 'Slightly Cloudy', 'Cloudy'],
    'URINE-PROTEIN': ['Negative', 'Trace', '+1'],
    'URINE-GLUCOSE': ['Negative', 'Trace'],
    'URINE-KETONES': ['Negative', 'Trace'],
    'URINE-BLOOD': ['Negative', 'Trace'],
    'URINE-BILI': ['Negative'],
    'URINE-NITRITE': ['Negative', 'Positive'],
    'URINE-LE': ['Negative', 'Trace'],
    'URINE-EPI': ['Few', 'Moderate'],
    'URINE-CASTS': ['None', 'Hyaline (0-2)'],
    'URINE-CRYSTALS': ['None', 'Few'],
    'URINE-BACTERIA': ['None', 'Few'],
  };

  if (qualitativeTests[testCode]) {
    const options = qualitativeTests[testCode];
    if (Math.random() > 0.85) {
      return options[Math.floor(Math.random() * options.length)];
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
    if (Math.random() > 0.7) {
      if (Math.random() > 0.5) {
        return Math.round((max + range * 0.3) * 100) / 100;
      } else {
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

    // Get FBC and LFT panels
    const fbcPanel = await db.collection('test_panels').findOne({ code: 'FBC' });
    const lftPanel = await db.collection('test_panels').findOne({ code: 'LFT' });

    if (!fbcPanel || !lftPanel) {
      console.log('❌ FBC or LFT panel not found');
      return;
    }

    console.log(`✅ Found FBC Panel: ${fbcPanel.name} (${fbcPanel.tests.length} tests)`);
    console.log(`✅ Found LFT Panel: ${lftPanel.name} (${lftPanel.tests.length} tests)\n`);

    // Get test IDs
    const fbcTestIds = fbcPanel.tests.map(t => new mongoose.Types.ObjectId(t.testId));
    const lftTestIds = lftPanel.tests.map(t => new mongoose.Types.ObjectId(t.testId));

    // Fetch tests
    const fbcTests = await db.collection('test_catalog').find({
      _id: { $in: fbcTestIds }
    }).toArray();

    const lftTests = await db.collection('test_catalog').find({
      _id: { $in: lftTestIds }
    }).toArray();

    // Sort tests
    const sortedFbcTests = fbcTestIds.map(id => 
      fbcTests.find(t => t._id.toString() === id.toString())
    ).filter(Boolean);

    const sortedLftTests = lftTestIds.map(id => 
      lftTests.find(t => t._id.toString() === id.toString())
    ).filter(Boolean);

    const allTests = [...sortedFbcTests, ...sortedLftTests];

    console.log(`✅ Loaded ${sortedFbcTests.length} FBC + ${sortedLftTests.length} LFT tests\n`);

    // Create NEW patients (no reuse)
    console.log('👥 Creating NEW patients...');
    const patientIds = [];
    for (const patient of patients) {
      const patientId = `P${Date.now()}${Math.floor(Math.random() * 10000)}`;
      
      const result = await db.collection('patients').insertOne({
        ...patient,
        patientId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      
      patientIds.push(result.insertedId);
      console.log(`✅ ${patient.firstName} ${patient.lastName} (${patient.age} years, ${patient.gender})`);
    }
    console.log('');

    // Create orders
    const orders = [];
    for (let i = 0; i < patientIds.length; i++) {
      const patient = patients[i];
      
      const order = {
        patientId: patientIds[i],
        orderNumber: `ORD-${Date.now()}-${i}`,
        orderDate: new Date(),
        status: 'completed',
        tests: allTests.map(t => t.code),
        panels: ['FBC', 'LFT'],
        order_tests: allTests.map(t => ({
          testCode: t.code,
          testName: t.name,
          category: t.category,
          sampleType: t.sampleType,
          price: t.price,
        })),
        totalAmount: fbcPanel.price + lftPanel.price,
        paidAmount: fbcPanel.price + lftPanel.price,
        paymentStatus: 'paid',
        paymentMethod: 'cash',
        createdBy: new mongoose.Types.ObjectId(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const inserted = await db.collection('orders').insertOne(order);
      orders.push({ ...order, _id: inserted.insertedId });

      console.log(`\n${'═'.repeat(100)}`);
      console.log(`📊 ${patient.firstName} ${patient.lastName} - ${order.orderNumber}`);
      console.log('═'.repeat(100));

      let abnormalCount = 0;

      // FBC Results
      console.log('\n🩸 FULL BLOOD COUNT (FBC)');
      console.log('─'.repeat(100));
      for (const test of sortedFbcTests) {
        const refRange = findReferenceRange(test, patient.age, patient.gender);
        const value = generateValue(refRange, test.code);
        const flag = calculateFlag(value, refRange);

        if (flag !== 'normal') abnormalCount++;

        await db.collection('results').insertOne({
          orderId: inserted.insertedId,
          testCode: test.code,
          testName: test.name,
          panelName: fbcPanel.name,
          panelCode: fbcPanel.code,
          panel_name: fbcPanel.name,
          panel_code: fbcPanel.code,
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
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const emoji = { normal: '✅', low: '⬇️ ', high: '⬆️ ', critical_low: '🔴', critical_high: '🔴' };
        console.log(`${emoji[flag]} ${test.code.padEnd(8)} ${test.name.padEnd(45)} ${value.toString().padStart(10)} ${(refRange.unit || test.unit || '').padEnd(10)} (${refRange.range || 'N/A'})`);
      }

      // LFT Results
      console.log('\n🧪 LIVER FUNCTION TEST (LFT)');
      console.log('─'.repeat(100));
      for (const test of sortedLftTests) {
        const refRange = findReferenceRange(test, patient.age, patient.gender);
        const value = generateValue(refRange, test.code);
        const flag = calculateFlag(value, refRange);

        if (flag !== 'normal') abnormalCount++;

        await db.collection('results').insertOne({
          orderId: inserted.insertedId,
          testCode: test.code,
          testName: test.name,
          panelName: lftPanel.name,
          panelCode: lftPanel.code,
          panel_name: lftPanel.name,
          panel_code: lftPanel.code,
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
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const emoji = { normal: '✅', low: '⬇️ ', high: '⬆️ ', critical_low: '🔴', critical_high: '🔴' };
        console.log(`${emoji[flag]} ${test.code.padEnd(8)} ${test.name.padEnd(45)} ${value.toString().padStart(10)} ${(refRange.unit || test.unit || '').padEnd(10)} (${refRange.range || 'N/A'})`);
      }

      console.log(`\n📈 Total: ${allTests.length} tests | Abnormal: ${abnormalCount}`);
    }

    console.log('\n' + '═'.repeat(100));
    console.log('✅ Fresh orders created successfully!\n');
    console.log('📝 Summary:');
    console.log(`   • FBC Panel: ${sortedFbcTests.length} tests`);
    console.log(`   • LFT Panel: ${sortedLftTests.length} tests`);
    console.log(`   • Total: ${allTests.length} tests per patient`);
    console.log(`   • ${patients.length} NEW patients created`);
    console.log(`   • ${orders.length} orders created\n`);
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
