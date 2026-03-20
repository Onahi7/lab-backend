const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb+srv://mmmnigeriaschool12_db_user:Iamhardy_7*@cluster0.abdi7yt.mongodb.net/carefaamlab?retryWrites=true&w=majority&appName=Cluster0&ssl=true&authSource=admin';

const patients = [
  {
    firstName: 'Karuma',
    lastName: 'Jada',
    gender: 'M',
    dateOfBirth: new Date(Date.now() - (4 * 365 * 24 * 60 * 60 * 1000)), // 4 years
    age: 4,
    phoneNumber: '+232-76-111-2222',
    email: 'karuma.jada@example.com',
  },
  {
    firstName: 'Turah',
    lastName: 'Musa',
    gender: 'F',
    dateOfBirth: new Date(Date.now() - (4 * 30 * 24 * 60 * 60 * 1000)), // 4 months
    age: 0,
    phoneNumber: '+232-76-333-4444',
    email: 'turah.musa@example.com',
  },
];

// Abnormal test configurations for each patient
const abnormalTests = {
  'Karuma': {
    'WBC': 'high',
    'NEUT%': 'high',
    'ESR': 'high',
    'ALT': 'high',
    'AST': 'high',
    'TBIL': 'high'
  },
  'Turah': {
    'HGB': 'low',
    'HCT': 'low',
    'RBC': 'low',
    'PLT': 'low',
    'ALB': 'low',
    'TP': 'low'
  }
};

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

function generateValue(refRange, forcedFlag = null) {
  const rangeStr = (refRange.range || '').replace(/[<>]/g, '').trim();
  const parts = rangeStr.split('-').map(v => parseFloat(v.trim()));
  
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    const [min, max] = parts;
    const mid = (min + max) / 2;
    const range = max - min;
    
    // If forced flag, generate value outside range
    if (forcedFlag === 'high') {
      return Math.round((max + range * 0.3) * 100) / 100;
    } else if (forcedFlag === 'low') {
      return Math.round((min - range * 0.3) * 100) / 100;
    } else if (forcedFlag === 'critical_high') {
      return Math.round((max + range * 0.6) * 100) / 100;
    } else if (forcedFlag === 'critical_low') {
      return Math.round((min - range * 0.6) * 100) / 100;
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

    console.log(`✅ Found FBC Panel: ${fbcPanel.name} (${fbcPanel.tests.length} tests)`);
    console.log(`✅ Found LFT Panel: ${lftPanel.name} (${lftPanel.tests.length} tests)\n`);

    // Get test IDs from panels (in the correct order)
    const fbcTestIds = fbcPanel.tests.map(t => new mongoose.Types.ObjectId(t.testId));
    const lftTestIds = lftPanel.tests.map(t => new mongoose.Types.ObjectId(t.testId));

    // Fetch actual test details from test_catalog
    const fbcTests = await db.collection('test_catalog').find({
      _id: { $in: fbcTestIds }
    }).toArray();

    const lftTests = await db.collection('test_catalog').find({
      _id: { $in: lftTestIds }
    }).toArray();

    // Sort tests to match panel order
    const sortedFbcTests = fbcTestIds.map(id => 
      fbcTests.find(t => t._id.toString() === id.toString())
    ).filter(Boolean);

    const sortedLftTests = lftTestIds.map(id => 
      lftTests.find(t => t._id.toString() === id.toString())
    ).filter(Boolean);

    console.log(`✅ Loaded ${sortedFbcTests.length} FBC tests from database`);
    console.log(`✅ Loaded ${sortedLftTests.length} LFT tests from database\n`);

    const allTests = [...sortedFbcTests, ...sortedLftTests];

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
      console.log(`✅ ${patient.firstName} ${patient.lastName} (${patient.age} ${patient.age === 0 ? 'months' : 'years'}, ${patient.gender})`);
    }
    console.log('');

    // Create orders with results
    const orders = [];
    for (let i = 0; i < patientIds.length; i++) {
      const patient = patients[i];
      const patientAbnormals = abnormalTests[patient.firstName] || {};
      
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
      };

      const inserted = await db.collection('orders').insertOne(order);
      orders.push({ ...order, _id: inserted.insertedId });

      console.log(`\n📊 ${patient.firstName} ${patient.lastName} - ${order.orderNumber}`);
      console.log('═'.repeat(100));

      let abnormalCount = 0;

      // FBC Results
      console.log('\n🩸 FULL BLOOD COUNT (FBC)');
      console.log('─'.repeat(100));
      for (const test of sortedFbcTests) {
        const refRange = findReferenceRange(test, patient.age, patient.gender);
        const forcedFlag = patientAbnormals[test.code];
        const value = generateValue(refRange, forcedFlag);
        const flag = calculateFlag(value, refRange);

        if (flag !== 'normal') abnormalCount++;

        await db.collection('results').insertOne({
          orderId: inserted.insertedId,
          testCode: test.code,
          testName: test.name,
          value: value.toString(),
          unit: refRange.unit || test.unit || '',
          referenceRange: refRange.range || '',
          flag,
          status: 'verified',
          enteredBy: new mongoose.Types.ObjectId(),
          enteredAt: new Date(),
          verifiedBy: new mongoose.Types.ObjectId(),
          verifiedAt: new Date(),
        });

        const emoji = { normal: '✅', low: '⬇️ ', high: '⬆️ ', critical_low: '🔴', critical_high: '🔴' };
        console.log(`${emoji[flag]} ${test.code.padEnd(8)} ${test.name.padEnd(45)} ${value.toString().padStart(10)} ${(refRange.unit || test.unit || '').padEnd(10)} (${refRange.range || 'N/A'})`);
      }

      // LFT Results
      console.log('\n🧪 LIVER FUNCTION TEST (LFT)');
      console.log('─'.repeat(100));
      for (const test of sortedLftTests) {
        const refRange = findReferenceRange(test, patient.age, patient.gender);
        const forcedFlag = patientAbnormals[test.code];
        const value = generateValue(refRange, forcedFlag);
        const flag = calculateFlag(value, refRange);

        if (flag !== 'normal') abnormalCount++;

        await db.collection('results').insertOne({
          orderId: inserted.insertedId,
          testCode: test.code,
          testName: test.name,
          value: value.toString(),
          unit: refRange.unit || test.unit || '',
          referenceRange: refRange.range || '',
          flag,
          status: 'verified',
          enteredBy: new mongoose.Types.ObjectId(),
          enteredAt: new Date(),
          verifiedBy: new mongoose.Types.ObjectId(),
          verifiedAt: new Date(),
        });

        const emoji = { normal: '✅', low: '⬇️ ', high: '⬆️ ', critical_low: '🔴', critical_high: '🔴' };
        console.log(`${emoji[flag]} ${test.code.padEnd(8)} ${test.name.padEnd(45)} ${value.toString().padStart(10)} ${(refRange.unit || test.unit || '').padEnd(10)} (${refRange.range || 'N/A'})`);
      }

      console.log(`\n📈 Abnormal Results: ${abnormalCount}`);
    }

    console.log('\n' + '═'.repeat(100));
    console.log('✅ Orders created successfully!\n');
    console.log('📝 Summary:');
    console.log(`   • FBC Panel: ${sortedFbcTests.length} tests`);
    console.log(`   • LFT Panel: ${sortedLftTests.length} tests`);
    console.log(`   • Total: ${allTests.length} tests per patient`);
    console.log(`   • ${patients.length} patients created`);
    console.log(`   • ${orders.length} orders created`);
    console.log(`   • ${allTests.length * orders.length} results generated\n`);
    console.log('🖨️  View reports at:');
    orders.forEach((o, i) => {
      console.log(`\n   ${i + 1}. ${patients[i].firstName} ${patients[i].lastName} (${patients[i].age} ${patients[i].age === 0 ? 'months' : 'years'})`);
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
