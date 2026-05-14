const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

function loadEnv(envFile) {
  if (!fs.existsSync(envFile)) return;
  const lines = fs.readFileSync(envFile, 'utf8').split('\n');
  lines.forEach((line) => {
    const [key, ...rest] = line.split('=');
    if (!key || rest.length === 0) return;
    const value = rest.join('=').trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key.trim()]) {
      process.env[key.trim()] = value;
    }
  });
}

const envPath = path.join(__dirname, '..', '.env');
const envDevPath = path.join(__dirname, '..', '.env.development');
loadEnv(envPath);
loadEnv(envDevPath);

const MONGODB_URI = process.env.MONGODB_URI || process.env.DATABASE_URL;
if (!MONGODB_URI) {
  console.error('Missing MONGODB_URI or DATABASE_URL in environment.');
  process.exit(1);
}

async function run() {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const orders = await db.collection('orders')
    .find({ createdAt: { $gte: yesterday, $lt: today } })
    .sort({ createdAt: -1 })
    .toArray();

  if (!orders.length) {
    console.log('No orders found for yesterday.');
    await mongoose.disconnect();
    return;
  }

  const patientIds = [...new Set(orders.map(o => String(o.patientId)).filter(Boolean))];
  const patients = await db.collection('patients')
    .find({ _id: { $in: patientIds.map(id => new mongoose.Types.ObjectId(id)) } })
    .toArray();

  const patientById = new Map(patients.map(p => [String(p._id), p]));

  console.log(`Yesterday orders: ${orders.length}`);
  console.log(`Unique patients: ${patientIds.length}`);
  console.log('');

  const byPatient = new Map();
  for (const order of orders) {
    const key = String(order.patientId);
    if (!byPatient.has(key)) byPatient.set(key, []);
    byPatient.get(key).push(order);
  }

  for (const [patientId, patientOrders] of byPatient.entries()) {
    const patient = patientById.get(patientId);
    const name = patient
      ? `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || patient.fullName || 'Unknown'
      : 'Unknown';
    const mrn = patient?.patientId || patient?.mrn || 'N/A';
    console.log(`- ${name} (${mrn}) — ${patientOrders.length} order(s)`);
    patientOrders.forEach((o) => {
      const time = o.createdAt ? new Date(o.createdAt).toLocaleString() : 'Unknown time';
      console.log(`  • ${o.orderNumber || o._id} | ${o.status || 'unknown'} | ${time}`);
    });
    console.log('');
  }

  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
