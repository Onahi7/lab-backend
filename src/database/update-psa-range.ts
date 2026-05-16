import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Model } from 'mongoose';
import { TestCatalog } from './schemas/test-catalog.schema';

/**
 * Update PSA reference range in the live database.
 * Run: pnpm update:psa-range
 */
async function updatePsaRange() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const catalog = app.get<Model<TestCatalog>>('TestCatalogModel');

  console.log('\n🧪 Updating PSA reference range in test_catalog...\n');

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
    { code: 'PSA' },
    { $set: update },
    { new: true },
  );

  if (res) {
    console.log(`  ✅ [PSA] ${res.name}`);
    console.log('     Range: 0-4.0 ng/mL');
  } else {
    console.log('  ⚠️  [PSA] not found in catalog — skipped');
  }

  console.log('\n✅ Done.');
  await app.close();
}

updatePsaRange()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Failed:', err);
    process.exit(1);
  });
