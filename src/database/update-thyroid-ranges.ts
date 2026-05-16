import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Model } from 'mongoose';
import { TestCatalog } from './schemas/test-catalog.schema';

/**
 * Update thyroid hormone reference ranges and units in the live database.
 * Run: pnpm update:thyroid-ranges
 */
async function updateThyroidRanges() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const catalog = app.get<Model<TestCatalog>>('TestCatalogModel');

  console.log('\nUpdating thyroid ranges in test_catalog...\n');

  const updates: Array<{
    code: string;
    unit: string;
    range: string;
  }> = [
    { code: 'T3', unit: 'nmol/L', range: '1.23-3.07' },
    { code: 'T4', unit: 'nmol/L', range: '66-181' },
    { code: 'TSH', unit: 'mIU/L', range: '0.3-4.2' },
  ];

  for (const entry of updates) {
    const update = {
      unit: entry.unit,
      referenceRanges: [
        {
          ageGroup: 'Adult',
          ageMin: 18,
          gender: 'all',
          range: entry.range,
          unit: entry.unit,
        },
      ],
    };

    const res = await catalog.findOneAndUpdate(
      { code: entry.code },
      { $set: update },
      { new: true },
    );

    if (res) {
      console.log(`  [${entry.code}] ${res.name}`);
      console.log(`     Range: ${entry.range} ${entry.unit}`);
    } else {
      console.log(`  [${entry.code}] not found in catalog - skipped`);
    }
  }

  console.log('\nDone.');
  await app.close();
}

updateThyroidRanges()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Failed:', err);
    process.exit(1);
  });
