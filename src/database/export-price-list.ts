import { NestFactory } from '@nestjs/core';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Model } from 'mongoose';
import { AppModule } from '../app.module';
import { TestCatalog } from './schemas/test-catalog.schema';
import { TestPanel } from './schemas/test-panel.schema';

async function exportPriceList() {
  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    const testCatalogModel = app.get<Model<TestCatalog>>('TestCatalogModel');
    const testPanelModel = app.get<Model<TestPanel>>('TestPanelModel');

    const tests = await testCatalogModel
      .find({ isActive: true })
      .select('code name category sampleType price unit referenceRange subcategory panelName')
      .sort({ category: 1, name: 1 })
      .lean();

    const panels = await testPanelModel
      .find({ isActive: true })
      .select('code name description price tests')
      .sort({ name: 1 })
      .lean();

    const outputPath = resolve(process.cwd(), '..', 'outputs', 'price-list-data.json');

    writeFileSync(
      outputPath,
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          tests,
          panels,
        },
        null,
        2,
      ),
      'utf8',
    );

    console.log(`Exported ${tests.length} active tests and ${panels.length} active panels to ${outputPath}`);
  } finally {
    await app.close();
  }
}

exportPriceList()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
