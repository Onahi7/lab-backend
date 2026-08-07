import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Model } from 'mongoose';
import { TestCatalog } from './schemas/test-catalog.schema';

async function seedOGTT() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const testCatalogModel = app.get<Model<TestCatalog>>('TestCatalogModel');

  const existing = await testCatalogModel.findOne({ code: 'OGTT' });
  if (existing) {
    console.log('OGTT already exists, updating...');
    await testCatalogModel.updateOne(
      { code: 'OGTT' },
      {
        $set: {
          name: 'Oral Glucose Tolerance Test',
          category: 'chemistry',
          price: 250,
          sampleType: 'blood',
          turnaroundTime: 180,
          isActive: true,
          unit: 'mmol/L',
          description: '75g oral glucose tolerance test with fasting, 1-hour and 2-hour readings',
          referenceRanges: [
            { ageGroup: 'Fasting', ageMin: 18, gender: 'all', range: '3.5-5.9', unit: 'mmol/L', criticalLow: '2.8', criticalHigh: '27.8' },
            { ageGroup: '1 hour', ageMin: 18, gender: 'all', range: '<10', unit: 'mmol/L' },
            { ageGroup: '2 hours', ageMin: 18, gender: 'all', range: '<8.6', unit: 'mmol/L' },
          ],
        },
      },
    );
    console.log('OGTT updated successfully');
  } else {
    console.log('Creating OGTT test...');
    await testCatalogModel.create({
      code: 'OGTT',
      name: 'Oral Glucose Tolerance Test',
      category: 'chemistry',
      price: 250,
      sampleType: 'blood',
      turnaroundTime: 180,
      isActive: true,
      unit: 'mmol/L',
      description: '75g oral glucose tolerance test with fasting, 1-hour and 2-hour readings',
      referenceRanges: [
        { ageGroup: 'Fasting', ageMin: 18, gender: 'all', range: '3.5-5.9', unit: 'mmol/L', criticalLow: '2.8', criticalHigh: '27.8' },
        { ageGroup: '1 hour', ageMin: 18, gender: 'all', range: '<10', unit: 'mmol/L' },
        { ageGroup: '2 hours', ageMin: 18, gender: 'all', range: '<8.6', unit: 'mmol/L' },
      ],
    });
    console.log('OGTT created successfully');
  }

  await app.close();
}

seedOGTT().catch((err) => {
  console.error('Failed to seed OGTT:', err);
  process.exit(1);
});
