import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Model } from 'mongoose';
import { TestCatalog } from './schemas/test-catalog.schema';
import { TestPanel } from './schemas/test-panel.schema';

/**
 * Creates the Hepatitis B 5-in-1 combo panel (HBsAg, HBsAb, HBeAg, HBeAb, HBcAb).
 * Each marker is a separate rapid test returning Reactive / Non-Reactive.
 * Run: pnpm seed:hepb
 */
async function addHepatitisBPanel() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const catalogModel = app.get<Model<TestCatalog>>('TestCatalogModel');
  const panelModel = app.get<Model<TestPanel>>('TestPanelModel');

  // ── 1. Create the 4 new sub-tests (HBSAG already exists) ────────────────
  const subTests = [
    { code: 'HBSAB', name: 'Hepatitis B Surface Antibody', description: 'HBsAb rapid test — Reactive / Non-Reactive' },
    { code: 'HBEAG', name: 'Hepatitis B e Antigen',         description: 'HBeAg rapid test — Reactive / Non-Reactive' },
    { code: 'HBEAB', name: 'Hepatitis B e Antibody',        description: 'HBeAb rapid test — Reactive / Non-Reactive' },
    { code: 'HBCAB', name: 'Hepatitis B Core Antibody',     description: 'HBcAb rapid test — Reactive / Non-Reactive' },
  ];

  for (const t of subTests) {
    await catalogModel.findOneAndUpdate(
      { code: t.code },
      {
        $set: {
          code: t.code,
          name: t.name,
          category: 'serology',
          sampleType: 'blood',
          price: 0,
          turnaroundTime: 30,
          isActive: false,       // panel-only — not orderable standalone
          description: t.description,
        },
      },
      { upsert: true, new: true },
    );
    console.log(`  ✅ ${t.code} — ${t.name}`);
  }

  // ── 2. Build the panel document ──────────────────────────────────────────
  const allCodes = ['HBSAG', 'HBSAB', 'HBEAG', 'HBEAB', 'HBCAB'];
  const testItems: { testId: any; testCode: string; testName: string }[] = [];

  for (const code of allCodes) {
    const doc = await catalogModel.findOne({ code });
    if (doc) {
      testItems.push({ testId: doc._id, testCode: doc.code, testName: doc.name });
    } else {
      console.warn(`  ⚠️  ${code} not found in test_catalog`);
    }
  }

  const panelDoc = await panelModel.findOneAndUpdate(
    { code: 'HEPB' },
    {
      $set: {
        code: 'HEPB',
        name: 'Hepatitis B Panel',
        description: '5-in-1 combo cassette — HBsAg, HBsAb, HBeAg, HBeAb, HBcAb (Reactive / Non-Reactive)',
        price: 170,
        isActive: true,
        tests: testItems,
      },
    },
    { upsert: true, new: true },
  );

  console.log(`\n  ✅ HEPB panel created — ${panelDoc.tests.length} sub-tests, Le ${panelDoc.price}`);
  console.log(`  Tests: ${testItems.map(t => t.testCode).join(', ')}`);

  await app.close();
}

addHepatitisBPanel()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Failed:', err);
    process.exit(1);
  });
