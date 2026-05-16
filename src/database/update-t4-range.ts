import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Model } from 'mongoose';
import { TestCatalog } from './schemas/test-catalog.schema';

/**
 * Update Total T4 reference range and unit in the live database.
 * Run: pnpm update:t4-range
 */
async function updateT4Range() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const catalog = app.get<Model<TestCatalog>>('TestCatalogModel');

  console.log('\n🧪 Updating T4 reference range in test_catalog...\n');

  const update = {
    unit: 'pmol/L',
    referenceRanges: [
      {
        ageGroup: 'Adult',
        ageMin: 18,
        gender: 'all',
        range: '12-22',
        unit: 'pmol/L',
      },
    ],
  };

  const res = await catalog.findOneAndUpdate(
    { code: 'T4' },
    { $set: update },
    { new: true },
  );

  if (res) {
    console.log(`  ✅ [T4] ${res.name}`);
    console.log('     Range: 12-22 pmol/L');
  } else {
    console.log('  ⚠️  [T4] not found in catalog — skipped');
  }

  console.log('\n✅ Done.');
  await app.close();
}

updateT4Range()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Failed:', err);
    process.exit(1);
  });
