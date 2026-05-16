import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Order } from './schemas/order.schema';
import { OrderTest } from './schemas/order-test.schema';
import { Result } from './schemas/result.schema';
import { TestCatalog } from './schemas/test-catalog.schema';

/**
 * One-off fix: update an order test from FPSA to PSA for a specific order number.
 * Run: pnpm fix:order-fpsa-to-psa
 */
const ORDER_NUMBER = 'ORD-20260508-0003';

async function fixOrderFpsaToPsa() {
  const app = await NestFactory.createApplicationContext(AppModule);

  const orderModel = app.get<Model<Order>>(getModelToken(Order.name));
  const orderTestModel = app.get<Model<OrderTest>>(getModelToken(OrderTest.name));
  const resultModel = app.get<Model<Result>>(getModelToken(Result.name));
  const testCatalogModel = app.get<Model<TestCatalog>>(getModelToken(TestCatalog.name));

  console.log(`\n🧪 Updating order ${ORDER_NUMBER}: FPSA -> PSA...\n`);

  const order = await orderModel.findOne({ orderNumber: ORDER_NUMBER }).lean();
  if (!order) {
    console.log('  ⚠️  Order not found — skipped');
    await app.close();
    return;
  }

  const psaCatalog = await testCatalogModel.findOne({ code: 'PSA' }).lean();
  if (!psaCatalog) {
    console.log('  ❌ PSA test not found in catalog — aborting');
    await app.close();
    return;
  }

  const orderTestUpdate = {
    testId: psaCatalog._id,
    testCode: 'PSA',
    testName: psaCatalog.name,
    price: psaCatalog.price,
  };

  const orderTestResult = await orderTestModel.updateMany(
    { orderId: order._id, testCode: 'FPSA' },
    { $set: orderTestUpdate },
  );

  const resultUpdate = {
    testCode: 'PSA',
    testName: psaCatalog.name,
  };

  const resultResult = await resultModel.updateMany(
    { orderId: order._id, testCode: 'FPSA' },
    { $set: resultUpdate },
  );

  console.log(`  ✅ order_tests updated: ${orderTestResult.modifiedCount}`);
  console.log(`  ✅ results updated: ${resultResult.modifiedCount}`);

  console.log('\n✅ Done.');
  await app.close();
}

fixOrderFpsaToPsa()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Failed:', err);
    process.exit(1);
  });
