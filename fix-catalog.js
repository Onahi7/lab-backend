#!/usr/bin/env node
/**
 * fix-catalog.js
 *
 * Fixes the following issues in the live database:
 *  1. Removes panel-level codes (FBC, LFT, LIPID, RFT, ELEC, URINE) from
 *     test_catalog — they belong only in test_panels.
 *  2. Sets FBC component tests to { price: 0, isActive: false }.
 *  3. Sets LFT component tests to { price: 0, isActive: false }.
 *  4. Fixes price mismatches vs price-updates.json:
 *       - HDL  : 200 → 120
 *       - GLU  :  50 →  80
 *  5. Fixes LIPID panel price: 660 → 320.
 */

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// ── Load .env ──────────────────────────────────────────────
function loadEnvFile() {
  try {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      envContent.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, ...valueParts] = trimmed.split('=');
          if (key && valueParts.length > 0) {
            process.env[key.trim()] = valueParts.join('=').trim();
          }
        }
      });
    }
  } catch (_) {}
}
loadEnvFile();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/lis';

// ── Minimal schemas ────────────────────────────────────────
const TestCatalogSchema = new mongoose.Schema(
  { code: String, name: String, category: String, price: Number, isActive: Boolean },
  { timestamps: true, collection: 'test_catalog' },
);
const TestPanelSchema = new mongoose.Schema(
  { code: String, name: String, tests: Array, price: Number, isActive: Boolean },
  { timestamps: true, collection: 'test_panels' },
);

const TestCatalog = mongoose.model('TestCatalog', TestCatalogSchema);
const TestPanel    = mongoose.model('TestPanel',   TestPanelSchema);

// ── Configuration ──────────────────────────────────────────

/** Panel-level codes that must NOT appear as individual test_catalog entries */
const PANEL_CODES_IN_CATALOG = ['FBC', 'LFT', 'LIPID', 'RFT', 'ELEC', 'URINE'];

/** FBC sub-parameters — not individually orderable */
const FBC_COMPONENTS = [
  'HB', 'HCT', 'RBC', 'WBC', 'PLT',
  'MCV', 'MCH', 'MCHC', 'RDW', 'RDWCV', 'RDWSD',
  'NEUT', 'LYMPH', 'MONO', 'EOS', 'BASO',
  'NEUTA', 'LYMPHA', 'MONOA', 'EOSA', 'BASOA',
  'MPV', 'PDW', 'PLTCT', 'PLCR', 'PLCC',
];

/** LFT sub-parameters — not individually orderable */
const LFT_COMPONENTS = ['ALT', 'AST', 'ALP', 'GGT', 'TBIL', 'DBIL', 'TP', 'ALB', 'GLOB', 'IBIL'];

/** Tests whose category needs correcting */
const CATEGORY_CORRECTIONS = {
  HBA1C: 'immunoassay',  // was 'chemistry' — measured on Finecare immunoassay analyzer
};

/** Tests whose name needs updating */
const NAME_CORRECTIONS = {
  MAU: 'Microalbumin (One Step)',  // price list calls it "One Step MAU"
};

/** New tests to insert if they don't already exist */
const NEW_TESTS = [
  {
    code: 'HPYLORI_IA',
    name: 'H. Pylori IgG Antibody (Finecare)',
    category: 'immunoassay',
    price: 270,
    sampleType: 'blood',
    turnaroundTime: 60,
    isActive: true,
    unit: 'AU/mL',
    description: 'Helicobacter pylori IgG antibody detection by Finecare immunoassay',
    referenceRanges: [
      { ageGroup: 'Negative', ageMin: 0, gender: 'all', range: '<10', unit: 'AU/mL' },
      { ageGroup: 'Positive', ageMin: 0, gender: 'all', range: '≥10', unit: 'AU/mL' },
    ],
  },
  {
    code: 'VITD_IA',
    name: 'Vitamin D [NEW] (Finecare)',
    category: 'immunoassay',
    price: 270,
    sampleType: 'blood',
    turnaroundTime: 60,
    isActive: true,
    unit: 'ng/mL',
    description: 'Vitamin D (25-OH) by Finecare immunoassay',
    referenceRanges: [
      { ageGroup: 'Deficiency', ageMin: 0, gender: 'all', range: '<20', unit: 'ng/mL' },
      { ageGroup: 'Insufficiency', ageMin: 0, gender: 'all', range: '20-30', unit: 'ng/mL' },
      { ageGroup: 'Sufficient', ageMin: 0, gender: 'all', range: '30-100', unit: 'ng/mL' },
    ],
  },
  {
    code: 'MAU',
    name: 'Microalbumin (One Step)',
    category: 'immunoassay',
    price: 130,
    sampleType: 'urine',
    turnaroundTime: 30,
    isActive: true,
    unit: 'mg/L',
    description: 'Microalbumin urine rapid test (one-step)',
    referenceRanges: [
      { ageGroup: 'Normal', ageMin: 0, gender: 'all', range: '<20', unit: 'mg/L' },
      { ageGroup: 'Microalbuminuria', ageMin: 0, gender: 'all', range: '20-200', unit: 'mg/L' },
      { ageGroup: 'Macroalbuminuria', ageMin: 0, gender: 'all', range: '>200', unit: 'mg/L' },
    ],
  },
  {
    code: 'DDIMER_OS',
    name: 'D-Dimer (One Step)',
    category: 'immunoassay',
    price: 220,
    sampleType: 'blood',
    turnaroundTime: 30,
    isActive: true,
    unit: 'µg/mL FEU',
    description: 'D-Dimer rapid one-step immunoassay',
    referenceRanges: [
      { ageGroup: 'Normal', ageMin: 0, gender: 'all', range: '<0.5', unit: 'µg/mL FEU' },
      { ageGroup: 'Elevated', ageMin: 0, gender: 'all', range: '≥0.5', unit: 'µg/mL FEU' },
    ],
  },
];

/** Individual test price corrections (code → correct price) */
const PRICE_CORRECTIONS = {
  HDL: 120,   // was 200, correct per price list
  GLU: 80,    // was 50, correct per price list
};

/** Panel price corrections (code → correct price) */
const PANEL_PRICE_CORRECTIONS = {
  LIPID: 320,  // was 660, correct per price list
};

// ── Helpers ────────────────────────────────────────────────
function sep(char = '─', len = 72) { return char.repeat(len); }
function tag(modified, skipped) {
  if (modified) return '✅ fixed';
  if (skipped)  return '✓  already correct';
  return '⚠️  not found';
}

// ── Main ───────────────────────────────────────────────────
async function fixCatalog() {
  console.log(`Connecting to: ${MONGODB_URI.replace(/\/\/.*@/, '//***@')}`);
  await mongoose.connect(MONGODB_URI);
  console.log('✓ Connected\n');

  let totalFixed = 0;

  // ── 1. Remove panel-level codes from test_catalog ──
  console.log(sep());
  console.log('1. REMOVE PANEL CODES FROM test_catalog');
  console.log(sep());
  console.log('   These codes belong only in test_panels, not as individual tests.\n');

  for (const code of PANEL_CODES_IN_CATALOG) {
    const existing = await TestCatalog.findOne({ code }).lean();
    if (!existing) {
      console.log(`   ${code.padEnd(12)} — not in catalog (ok)`);
      continue;
    }
    await TestCatalog.deleteOne({ code });
    console.log(`   ${code.padEnd(12)} — DELETED from test_catalog (was Le ${existing.price})`);
    totalFixed++;
  }

  // ── 2. Deactivate FBC components ──
  console.log(`\n${sep()}`);
  console.log('2. FBC COMPONENTS → price=0, isActive=false');
  console.log(sep());
  console.log('   These are reported automatically as part of the FBC panel.\n');

  for (const code of FBC_COMPONENTS) {
    const doc = await TestCatalog.findOne({ code }).lean();
    if (!doc) { console.log(`   ${code.padEnd(12)} — not found`); continue; }
    const alreadyOk = doc.price === 0 && doc.isActive === false;
    if (!alreadyOk) {
      await TestCatalog.updateOne({ code }, { $set: { price: 0, isActive: false } });
      console.log(`   ${code.padEnd(12)} — ${tag(true, false)}  (was price=${doc.price}, isActive=${doc.isActive})`);
      totalFixed++;
    } else {
      console.log(`   ${code.padEnd(12)} — ${tag(false, true)}`);
    }
  }

  // ── 3. Deactivate LFT components ──
  console.log(`\n${sep()}`);
  console.log('3. LFT COMPONENTS → price=0, isActive=false');
  console.log(sep());
  console.log('   These are reported automatically as part of the LFT panel.\n');

  for (const code of LFT_COMPONENTS) {
    const doc = await TestCatalog.findOne({ code }).lean();
    if (!doc) { console.log(`   ${code.padEnd(12)} — not found`); continue; }
    const alreadyOk = doc.price === 0 && doc.isActive === false;
    if (!alreadyOk) {
      await TestCatalog.updateOne({ code }, { $set: { price: 0, isActive: false } });
      console.log(`   ${code.padEnd(12)} — ${tag(true, false)}  (was price=${doc.price}, isActive=${doc.isActive})`);
      totalFixed++;
    } else {
      console.log(`   ${code.padEnd(12)} — ${tag(false, true)}`);
    }
  }

  // ── 4. Fix individual test price mismatches ──
  console.log(`\n${sep()}`);
  console.log('4. INDIVIDUAL TEST PRICE CORRECTIONS');
  console.log(sep());
  console.log('   Prices corrected to match the official price list.\n');

  for (const [code, correctPrice] of Object.entries(PRICE_CORRECTIONS)) {
    const doc = await TestCatalog.findOne({ code }).lean();
    if (!doc) { console.log(`   ${code.padEnd(12)} — not found`); continue; }
    if (doc.price !== correctPrice) {
      await TestCatalog.updateOne({ code }, { $set: { price: correctPrice } });
      console.log(`   ${code.padEnd(12)} — ${tag(true, false)}  Le ${doc.price} → Le ${correctPrice}`);
      totalFixed++;
    } else {
      console.log(`   ${code.padEnd(12)} — ${tag(false, true)}  Le ${doc.price}`);
    }
  }

  // ── 5. Fix panel prices ──
  console.log(`\n${sep()}`);
  console.log('5. PANEL PRICE CORRECTIONS');
  console.log(sep());
  console.log('   Panel prices corrected to match the official price list.\n');

  for (const [code, correctPrice] of Object.entries(PANEL_PRICE_CORRECTIONS)) {
    const panel = await TestPanel.findOne({ code }).lean();
    if (!panel) { console.log(`   ${code.padEnd(12)} — panel not found`); continue; }
    if (panel.price !== correctPrice) {
      await TestPanel.updateOne({ code }, { $set: { price: correctPrice } });
      console.log(`   ${code.padEnd(12)} — ${tag(true, false)}  Le ${panel.price} → Le ${correctPrice}`);
      totalFixed++;
    } else {
      console.log(`   ${code.padEnd(12)} — ${tag(false, true)}  Le ${panel.price}`);
    }
  }

  // ── 6. Fix category mismatches ──
  console.log(`\n${sep()}`);
  console.log('6. CATEGORY CORRECTIONS');
  console.log(sep());
  console.log('   Correcting category assignments to match machine/department.\n');

  for (const [code, correctCategory] of Object.entries(CATEGORY_CORRECTIONS)) {
    const doc = await TestCatalog.findOne({ code }).lean();
    if (!doc) { console.log(`   ${code.padEnd(12)} — not found`); continue; }
    if (doc.category !== correctCategory) {
      await TestCatalog.updateOne({ code }, { $set: { category: correctCategory } });
      console.log(`   ${code.padEnd(12)} — ${tag(true, false)}  '${doc.category}' → '${correctCategory}'`);
      totalFixed++;
    } else {
      console.log(`   ${code.padEnd(12)} — ${tag(false, true)}  already '${correctCategory}'`);
    }
  }

  // ── 6b. Fix name mismatches ──
  console.log(`\n${sep()}`);
  console.log('6b. NAME CORRECTIONS');
  console.log(sep());
  console.log('   Correcting test names to match the official price list.\n');

  for (const [code, correctName] of Object.entries(NAME_CORRECTIONS)) {
    const doc = await TestCatalog.findOne({ code }).lean();
    if (!doc) { console.log(`   ${code.padEnd(12)} — not found`); continue; }
    if (doc.name !== correctName) {
      await TestCatalog.updateOne({ code }, { $set: { name: correctName } });
      console.log(`   ${code.padEnd(12)} — ${tag(true, false)}  '${doc.name}' → '${correctName}'`);
      totalFixed++;
    } else {
      console.log(`   ${code.padEnd(12)} — ${tag(false, true)}  already '${correctName}'`);
    }
  }

  // ── 7. Insert new tests ──
  console.log(`\n${sep()}`);
  console.log('7. INSERT NEW TESTS');
  console.log(sep());
  console.log('   Adding tests that are not yet in the catalog.\n');

  for (const test of NEW_TESTS) {
    const existing = await TestCatalog.findOne({ code: test.code }).lean();
    if (existing) {
      console.log(`   ${test.code.padEnd(14)} — already exists (skipped)`);
      continue;
    }
    // Build the document — only include fields the schema supports
    await TestCatalog.create(test);
    console.log(`   ${test.code.padEnd(14)} — ✅ inserted  Le ${test.price}  [${test.category}]`);
    totalFixed++;
  }

  // ── Final summary ──
  console.log(`\n${sep('═')}`);
  console.log('DONE');
  console.log(sep('═'));
  console.log(`Total changes applied: ${totalFixed}`);

  // Quick verification snapshot
  const activeCount   = await TestCatalog.countDocuments({ isActive: true });
  const inactiveCount = await TestCatalog.countDocuments({ isActive: false });
  const panelCount    = await TestPanel.countDocuments({});
  console.log(`\ntest_catalog  →  ${activeCount} active  /  ${inactiveCount} inactive`);
  console.log(`test_panels   →  ${panelCount} panels`);

  // Confirm panel codes are gone from catalog
  const lingering = await TestCatalog.find({ code: { $in: PANEL_CODES_IN_CATALOG } }).lean();
  if (lingering.length === 0) {
    console.log('\n✅ No panel codes remain in test_catalog.');
  } else {
    console.log(`\n⚠️  Still in test_catalog: ${lingering.map(d => d.code).join(', ')}`);
  }

  console.log(sep('═'));

  await mongoose.disconnect();
}

fixCatalog()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Fatal error:', err.message);
    process.exit(1);
  });
