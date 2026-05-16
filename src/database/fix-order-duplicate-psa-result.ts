import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Order } from './schemas/order.schema';
import { Result } from './schemas/result.schema';

/**
 * One-off fix: remove FPSA result from an order now using PSA.
 * Run: pnpm fix:order-duplicate-psa-result
 */
const ORDER_NUMBER = 'ORD-20260508-0003';

async function fixOrderDuplicatePsaResult() {
  const app = await NestFactory.createApplicationContext(AppModule);

  const orderModel = app.get<Model<Order>>(getModelToken(Order.name));
  const resultModel = app.get<Model<Result>>(getModelToken(Result.name));

  console.log(`\n🧪 Cleaning FPSA result for ${ORDER_NUMBER}...\n`);

  const order = await orderModel.findOne({ orderNumber: ORDER_NUMBER }).lean();
  if (!order) {
    console.log('  ⚠️  Order not found — aborting');
    await app.close();
    return;
  }

  const deleteResult = await resultModel.deleteMany({
    orderId: order._id,
    testCode: 'FPSA',
  });

  console.log(`  ✅ FPSA results deleted: ${deleteResult.deletedCount}`);

  console.log('\n✅ Done.');
  await app.close();
}

fixOrderDuplicatePsaResult()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Failed:', err);
    process.exit(1);
  });
