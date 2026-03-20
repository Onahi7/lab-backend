/**
 * Create orders with immunoassay/serology tests
 */

const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb+srv://mmmnigeriaschool12_db_user:Iamhardy_7*@cluster0.abdi7yt.mongodb.net/carefaamlab?retryWrites=true&w=majority&appName=Cluster0&ssl=true&authSource=admin';

const patients = [
  {
    firstName: 'Sarah',
    lastName: 'Conteh',
    gender: 'F',
    dateOfBirth: new Date(Date.now() - (32 * 365 * 24 * 60 * 60 * 1000)), // 32 years
    age: 32,
    phoneNumber: '+232-76-999-0000',
    email: 'sarah.conteh@example.com',
  },
  {
    firstName: 'Ibrahim',
    lastName: 'Koroma',
    gender: 'M',
    dateOfBirth: new Date(Date.now() - (25 * 365 * 24 * 60 * 60 * 1000)), // 25 years
    age: 25,
    phoneNumber: '+232-76-111-2222',
    email: 'ibrahim.koroma@example.com',
  },
];

async function main() {
  try {
    console.log('🔌 Connecting...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected\n');

    const db = mongoose.connection.db;

    // Get all immunoassay panels
    const immunoassayPanels = await db.collection('test_panels').find({
      category: 'immunoassay'
    }).toArray();

    // Also get immunoassay tests directly
    const immunoassayTests = await db.collection('test_catalog').find({
      category: 'immunoassay'
    }).toArray();

    console.log(`✅ Found ${immunoassayTests.length} immunoassay tests in catalog\n`);

    if (immunoassayPanels.length === 0 && immunoassayTests.length > 0) {
      console.log('Creating Serology Panel from existing tests...\n');
      
      // Create a serology panel from existing tests
      const serologyPanel = {
        code: 'SEROLOGY',
        name: 'Serology Panel',
        category: 'immunoassay',
        tests: immunoassayTests.map(t => ({ testId: t._id })),
        price: 200,
        turnaroundTime: 24,
        sampleType: 'Serum',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await db.collection('test_panels').insertOne(serologyPanel);
      immunoassayPanels.push(serologyPanel);
      console.log(`✅ Created Serology Panel with ${immunoassayTests.length} tests\n`);
    } else if (immunoassayPanels.length > 0) {
      console.log(`✅ Found ${immunoassayPanels.length} immunoassay panels:\n`);
      immunoassayPanels.forEach(panel => {
        console.log(`   📋 ${panel.name} (${panel.code}) - ${panel.tests.length} tests`);
      });
      console.log('');
    }

    // Use existing tests
    const allTests = immunoassayTests;

    console.log(`✅ Loaded ${allTests.length} immunoassay tests\n`);

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
        panels: immunoassayPanels.map(p => p.code),
        order_tests: allTests.map(t => ({
          testCode: t.code,
          testName: t.name,
          category: t.category,
          sampleType: t.sampleType,
          price: t.price,
        })),
        totalAmount: immunoassayPanels.reduce((sum, p) => sum + (p.price || 0), 0),
        paidAmount: immunoassayPanels.reduce((sum, p) => sum + (p.price || 0), 0),
        paymentStatus: 'paid',
        paymentMethod: 'cash',
        createdBy: new mongoose.Types.ObjectId(),
      };

      const inserted = await db.collection('orders').insertOne(order);
      orders.push({ ...order, _id: inserted.insertedId });

      console.log(`\n${'═'.repeat(100)}`);
      console.log(`📊 ${patient.firstName} ${patient.lastName} - ${order.orderNumber}`);
      console.log('═'.repeat(100));
      console.log('\n🧪 SEROLOGY / IMMUNOASSAY');
      console.log('─'.repeat(100));

      // Generate results
      for (const test of allTests) {
        let value, flag;
        
        // Qualitative tests
        if (['HIV', 'HBsAg', 'HCV', 'VDRL', 'TPHA'].includes(test.code)) {
          // Mostly non-reactive, occasionally reactive
          value = (Math.random() > 0.9) ? 'Reactive' : 'Non-Reactive';
          flag = value === 'Reactive' ? 'high' : 'normal';
        } else if (['PREG', 'MALARIA', 'TYPHOID'].includes(test.code)) {
          value = (Math.random() > 0.85) ? 'Positive' : 'Negative';
          flag = value === 'Positive' ? 'high' : 'normal';
        } else if (test.referenceRange && test.referenceRange.includes('-')) {
          // Quantitative tests (TSH, PSA, etc.)
          const rangeStr = test.referenceRange.replace(/[<>]/g, '').trim();
          const parts = rangeStr.split('-').map(v => parseFloat(v.trim()));
          
          if (parts.length === 2) {
            const [min, max] = parts;
            const mid = (min + max) / 2;
            const range = max - min;
            value = (mid + (range * (Math.random() - 0.5) * 0.6)).toFixed(2);
            
            const numValue = parseFloat(value);
            if (numValue < min) flag = 'low';
            else if (numValue > max) flag = 'high';
            else flag = 'normal';
          } else {
            value = (parts[0] * 0.8).toFixed(2);
            flag = 'normal';
          }
        } else {
          // Default to negative/non-reactive
          value = test.referenceRange || 'Negative';
          flag = 'normal';
        }

        // Find panel
        let testPanelName = null;
        let testPanelCode = null;
        for (const panel of immunoassayPanels) {
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
          value: value,
          unit: test.unit || '',
          referenceRange: test.referenceRange || '',
          flag,
          status: 'verified',
          enteredBy: new mongoose.Types.ObjectId(),
          enteredAt: new Date(),
          verifiedBy: new mongoose.Types.ObjectId(),
          verifiedAt: new Date(),
        });

        const emoji = { normal: '✅', low: '⬇️ ', high: '⬆️ ', critical_low: '🔴', critical_high: '🔴' };
        console.log(`${emoji[flag]} ${test.code.padEnd(10)} ${test.name.padEnd(45)} ${value.toString().padStart(15)} ${(test.unit || '').padEnd(10)} (${test.referenceRange || 'N/A'})`);
      }
    }

    console.log('\n' + '═'.repeat(100));
    console.log('✅ Immunoassay orders created successfully!\n');
    console.log('📝 Summary:');
    console.log(`   • Total Tests: ${allTests.length}`);
    console.log(`   • Patients: ${patients.length}`);
    console.log(`   • Orders: ${orders.length}\n`);
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
