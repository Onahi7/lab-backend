import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from '../app.module';
import { TestCatalog } from './schemas/test-catalog.schema';
import { TestPanel } from './schemas/test-panel.schema';

async function updateGgtAndCortisolRanges() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const catalog = app.get<Model<TestCatalog>>('TestCatalogModel');
  const testPanelModel = app.get<Model<TestPanel>>(getModelToken(TestPanel.name));

  console.log('\nUpdating GGT, CORTISOL, FBC, and immunoassay prices...\n');

  const ggtUpdate = await catalog.findOneAndUpdate(
    { code: 'GGT' },
    {
      $set: {
        unit: 'U/L',
        referenceRange: '8-61',
        referenceRanges: [
          { ageGroup: 'Adult Male', ageMin: 18, gender: 'M', range: '8-61', unit: 'U/L' },
          { ageGroup: 'Adult Female', ageMin: 18, gender: 'F', range: '8-61', unit: 'U/L' },
        ],
      },
    },
    { new: true },
  );

  if (ggtUpdate) {
    console.log(`  [GGT] ${ggtUpdate.name}`);
    console.log('     Range: 8-61 U/L');
  } else {
    console.log('  [GGT] not found in catalog - skipped');
  }

  const cortisolUpdate = await catalog.findOneAndUpdate(
    { code: 'CORTISOL' },
    {
      $set: {
        unit: 'nmol/L',
        referenceRange: '134-522',
        referenceRanges: [
          {
            ageGroup: '7am to 10am',
            ageMin: 18,
            gender: 'all',
            condition: '7am-10am',
            range: '134-522',
            unit: 'nmol/L',
          },
          {
            ageGroup: '4pm to 8pm',
            ageMin: 18,
            gender: 'all',
            condition: '4pm-8pm',
            range: '77-317',
            unit: 'nmol/L',
          },
        ],
      },
    },
    { new: true },
  );

  if (cortisolUpdate) {
    console.log(`  [CORTISOL] ${cortisolUpdate.name}`);
    console.log('     7am to 10am: 134-522 nmol/L');
    console.log('     4pm to 8pm: 77-317 nmol/L');
  } else {
    console.log('  [CORTISOL] not found in catalog - skipped');
  }

  const fbcCatalogUpdate = await catalog.findOneAndUpdate(
    { code: 'FBC' },
    { $set: { price: 170 } },
    { new: true },
  );

  if (fbcCatalogUpdate) {
    console.log(`  [FBC catalog] ${fbcCatalogUpdate.name}`);
    console.log('     Price: 170');
  } else {
    console.log('  [FBC catalog] not found - skipped');
  }

  const fbcPanelUpdate = await testPanelModel.findOneAndUpdate(
    { code: 'FBC' },
    { $set: { price: 170 } },
    { new: true },
  );

  if (fbcPanelUpdate) {
    console.log(`  [FBC panel] ${fbcPanelUpdate.name}`);
    console.log('     Price: 170');
  } else {
    console.log('  [FBC panel] not found - skipped');
  }

  const immunoassaysToRaise = await catalog
    .find({ category: 'immunoassay', price: 220 })
    .select('code name price')
    .lean();

  if (immunoassaysToRaise.length > 0) {
    await catalog.updateMany(
      { category: 'immunoassay', price: 220 },
      { $set: { price: 250 } },
    );

    console.log(`  [Immunoassays] Updated ${immunoassaysToRaise.length} test(s) from 220 to 250`);
    immunoassaysToRaise.forEach((test) => {
      console.log(`     ${test.code} - ${test.name}`);
    });
  } else {
    console.log('  [Immunoassays] No category=immunoassay tests found at price 220');
  }

  console.log('\nDone.');
  await app.close();
}

updateGgtAndCortisolRanges()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  });
