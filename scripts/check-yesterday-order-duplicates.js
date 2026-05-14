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

loadEnv(path.join(__dirname, '..', '.env'));
loadEnv(path.join(__dirname, '..', '.env.development'));

const MONGODB_URI = process.env.MONGODB_URI || process.env.DATABASE_URL;
if (!MONGODB_URI) {
  console.error('Missing MONGODB_URI or DATABASE_URL in environment.');
  process.exit(1);
}

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase();
}

async function getOrderTests(db, orderId) {
  const orderTests = await db.collection('order_tests').find({ orderId }).toArray();
  if (orderTests.length > 0) return orderTests;
  // Fallback if collection name differs
  return db.collection('ordertests').find({ orderId }).toArray();
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

  console.log(`Checking ${orders.length} orders from yesterday (${yesterday.toDateString()})...`);
  console.log('');

  let flaggedCount = 0;

  for (const order of orders) {
    const orderId = order._id;
    const orderNumber = order.orderNumber || String(orderId);

    const orderTests = await getOrderTests(db, orderId);
    const results = await db.collection('results').find({ orderId }).toArray();

    const testCodeCounts = new Map();
    orderTests.forEach((t) => {
      const code = normalizeCode(t.testCode);
      if (!code) return;
      testCodeCounts.set(code, (testCodeCounts.get(code) || 0) + 1);
    });

    const duplicateCodes = [...testCodeCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([code, count]) => `${code}(${count})`);

    const resultCodeCounts = new Map();
    results.forEach((r) => {
      const code = normalizeCode(r.testCode);
      if (!code) return;
      resultCodeCounts.set(code, (resultCodeCounts.get(code) || 0) + 1);
    });

    const duplicateResultCodes = [...resultCodeCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([code, count]) => `${code}(${count})`);

    const orderTestIds = new Set(orderTests.map((t) => String(t._id)));
    const resultsWithMissingOrderTestId = results.filter((r) => !r.orderTestId);
    const resultsWithUnknownOrderTestId = results.filter((r) => r.orderTestId && !orderTestIds.has(String(r.orderTestId)));

    const hasIssues =
      duplicateCodes.length > 0 ||
      duplicateResultCodes.length > 0 ||
      resultsWithMissingOrderTestId.length > 0 ||
      resultsWithUnknownOrderTestId.length > 0;

    if (hasIssues) {
      flaggedCount += 1;
      console.log(`Order ${orderNumber} (${order.status || 'unknown'})`);
      console.log(`  OrderTests: ${orderTests.length}, Results: ${results.length}`);
      if (duplicateCodes.length > 0) {
        console.log(`  Duplicate test codes in order_tests: ${duplicateCodes.join(', ')}`);
      }
      if (duplicateResultCodes.length > 0) {
        console.log(`  Duplicate test codes in results: ${duplicateResultCodes.join(', ')}`);
      }
      if (resultsWithMissingOrderTestId.length > 0) {
        console.log(`  Results missing orderTestId: ${resultsWithMissingOrderTestId.length}`);
      }
      if (resultsWithUnknownOrderTestId.length > 0) {
        console.log(`  Results with unknown orderTestId: ${resultsWithUnknownOrderTestId.length}`);
      }
      console.log('');
    }
  }

  if (flaggedCount === 0) {
    console.log('No duplicate test codes or result linkage issues found for yesterday.');
  } else {
    console.log(`Flagged orders with issues: ${flaggedCount}`);
  }

  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
