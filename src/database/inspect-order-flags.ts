import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Order } from './schemas/order.schema';
import { OrderTest } from './schemas/order-test.schema';
import { Result } from './schemas/result.schema';
import { TestCatalog } from './schemas/test-catalog.schema';
import { Patient } from './schemas/patient.schema';
import { resolveReferenceRange } from '../common/utils/reference-range-resolver';

/**
 * Inspect reference ranges and flags for a specific order.
 * Run: pnpm ts-node -r tsconfig-paths/register src/database/inspect-order-flags.ts
 */
const ORDER_NUMBER = 'ORD-20260508-0003';
const TARGET_CODES = new Set(['FT4', 'PSA']);

async function inspectOrderFlags() {
  const app = await NestFactory.createApplicationContext(AppModule);

  const orderModel = app.get<Model<Order>>(getModelToken(Order.name));
  const orderTestModel = app.get<Model<OrderTest>>(getModelToken(OrderTest.name));
  const resultModel = app.get<Model<Result>>(getModelToken(Result.name));
  const testCatalogModel = app.get<Model<TestCatalog>>(getModelToken(TestCatalog.name));
  const patientModel = app.get<Model<Patient>>(getModelToken(Patient.name));

  console.log(`\n🔎 Inspecting order ${ORDER_NUMBER}...\n`);

  const order = await orderModel.findOne({ orderNumber: ORDER_NUMBER }).lean();
  if (!order) {
    console.log('  ⚠️  Order not found — aborting');
    await app.close();
    return;
  }

  const patient = await patientModel.findById(order.patientId).lean();
  console.log(`  Patient: ${patient?.firstName || ''} ${patient?.lastName || ''}`.trim() || '  Patient: (unknown)');
  console.log(`  Age: ${patient?.age ?? 'n/a'} | Gender: ${patient?.gender ?? 'n/a'}`);

  const orderTests = await orderTestModel.find({ orderId: order._id }).lean();
  const results = await resultModel.find({ orderId: order._id }).lean();

  for (const code of Array.from(TARGET_CODES)) {
    const orderTest = orderTests.find((t) => t.testCode === code);
    const result = results.find((r) => r.testCode === code);
    const catalog = await testCatalogModel.findOne({ code }).lean();

    console.log('\n' + '-'.repeat(60));
    console.log(`  Test: ${code}`);
    console.log(`  OrderTest: ${orderTest ? '✅ present' : '❌ missing'}`);
    console.log(`  Result: ${result ? '✅ present' : '❌ missing'}`);

    if (result) {
      console.log(`  Value: ${result.value}`);
      console.log(`  Result referenceRange: ${result.referenceRange || '—'}`);
      console.log(`  Flag: ${result.flag || '—'}`);
      console.log(`  MenstrualPhase: ${result.menstrualPhase || '—'}`);
    }

    if (catalog) {
      const computedRange = resolveReferenceRange({
        age: patient?.age,
        gender: (patient?.gender as any) || undefined,
        referenceRanges: catalog.referenceRanges,
        simpleReferenceRange: catalog.referenceRange,
        pregnancy: result?.menstrualPhase === 'pregnancy' ? true : undefined,
        condition: result?.menstrualPhase && result?.menstrualPhase !== 'pregnancy' ? result.menstrualPhase : undefined,
      });

      console.log(`  Catalog unit: ${catalog.unit || '—'}`);
      console.log(`  Catalog ranges: ${catalog.referenceRanges?.length || 0}`);
      console.log(`  Computed range: ${computedRange || '—'}`);
    } else {
      console.log('  Catalog: ❌ missing');
    }
  }

  console.log('\n✅ Done.');
  await app.close();
}

inspectOrderFlags()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Failed:', err);
    process.exit(1);
  });
