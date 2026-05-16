import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Model } from 'mongoose';
import { TestCatalog } from './schemas/test-catalog.schema';

/**
 * Update Free PSA reference range in the live database.
 * Run: pnpm update:fpsa-range
 */
async function updateFpsaRange() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const catalog = app.get<Model<TestCatalog>>('TestCatalogModel');

  console.log('\n🧪 Updating FPSA reference range in test_catalog...\n');

  const update = {
    unit: 'ng/mL',
    referenceRanges: [
      {
        ageGroup: 'Adult',
        ageMin: 18,
        gender: 'M',
        range: '0-4.0',
        unit: 'ng/mL',
      },
    ],
  };

  const res = await catalog.findOneAndUpdate(
    { code: 'FPSA' },
    { $set: update },
    { new: true },
  );

  if (res) {
    console.log(`  ✅ [FPSA] ${res.name}`);
    console.log('     Range: 0-4.0 ng/mL');
  } else {
    console.log('  ⚠️  [FPSA] not found in catalog — skipped');
  }

  console.log('\n✅ Done.');
  await app.close();
}

updateFpsaRange()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Failed:', err);
    process.exit(1);
  });
