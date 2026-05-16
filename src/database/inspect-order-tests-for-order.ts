import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Order } from './schemas/order.schema';
import { OrderTest } from './schemas/order-test.schema';
import { Result } from './schemas/result.schema';

/**
 * Inspect order_tests and results for a specific order number.
 * Run: pnpm ts-node -r tsconfig-paths/register src/database/inspect-order-tests-for-order.ts
 */
const ORDER_NUMBER = 'ORD-20260508-0003';

async function inspectOrderTestsForOrder() {
  const app = await NestFactory.createApplicationContext(AppModule);

  const orderModel = app.get<Model<Order>>(getModelToken(Order.name));
  const orderTestModel = app.get<Model<OrderTest>>(getModelToken(OrderTest.name));
  const resultModel = app.get<Model<Result>>(getModelToken(Result.name));

  console.log(`\n🔎 Inspecting order_tests/results for ${ORDER_NUMBER}...\n`);

  const order = await orderModel.findOne({ orderNumber: ORDER_NUMBER }).lean();
  if (!order) {
    console.log('  ⚠️  Order not found — aborting');
    await app.close();
    return;
  }

  const orderTests = await orderTestModel.find({ orderId: order._id }).lean();
  const results = await resultModel.find({ orderId: order._id }).lean();

  console.log(`  OrderTests: ${orderTests.length}`);
  orderTests.forEach((t, i) => {
    console.log(
      `   ${i + 1}. ${t.testCode} | ${t.testName} | id=${t._id} | testId=${t.testId || '—'} | price=${t.price} | status=${t.status}`,
    );
  });

  console.log(`\n  Results: ${results.length}`);
  results.forEach((r, i) => {
    console.log(
      `   ${i + 1}. ${r.testCode} | ${r.testName} | id=${r._id} | orderTestId=${r.orderTestId || '—'} | value=${r.value} | flag=${r.flag}`,
    );
  });

  console.log('\n✅ Done.');
  await app.close();
}

inspectOrderTestsForOrder()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Failed:', err);
    process.exit(1);
  });
