#!/usr/bin/env node
/**
 * fix-fbc.js
 *
 * Aligns FBC data in the live database to the Zybio ZS-2 hematology analyzer:
 *
 *  1. Updates reference ranges for all 25 FBC parameters (neonatal / pediatric / adult)
 *  2. Fixes units:
 *       MCHC : g/dL  →  g/L   (analyzer reports in g/L; ranges change accordingly)
 *       PLTCT: %     →  ml/L  (PCT field; analyzer reports 1.08-2.82 ml/L)
 *  3. Corrects wrong ranges: RDWCV, RDWSD, MPV, PLCR, PLT, WBC (sex-split adult)
 *  4. Adds neonatal + pediatric ranges to absolute differential counts
 *     (NEUTA, LYMPHA, MONOA, EOSA, BASOA had adult-only ranges before)
 *  5. Reorders the FBC test_panel to match analyzer top-to-bottom output
 *
 * Run:  node fix-fbc.js
 */

const mongoose = require('mongoose');
const fs       = require('fs');
const path     = require('path');

// ── Load .env ──────────────────────────────────────────────
function loadEnvFile() {
  try {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
      fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
        const t = line.trim();
        if (t && !t.startsWith('#')) {
          const [key, ...vals] = t.split('=');
          if (key && vals.length) process.env[key.trim()] = vals.join('=').trim();
        }
      });
    }
  } catch (_) {}
}
loadEnvFile();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/lis';

// ── Schemas (strict:false so $set on any field works) ──────
const TestCatalog = mongoose.model(
  'TestCatalog',
  new mongoose.Schema(
    { code: String, name: String, category: String, price: Number, isActive: Boolean },
    { strict: false, timestamps: true, collection: 'test_catalog' },
  ),
);
const TestPanel = mongoose.model(
  'TestPanel',
  new mongoose.Schema(
    { code: String, name: String, tests: Array, price: Number, isActive: Boolean },
    { strict: false, timestamps: true, collection: 'test_panels' },
  ),
);

// ═══════════════════════════════════════════════════════════
//  SECTION 1 — Reference ranges extracted from Zybio ZS-2
//              printouts (9 patients: 1 neonate, 5 children,
//              3 adult females)
//
//  Age groups (in years):
//    Neonatal  : ageMin 0      → ageMax 0.02  (~0–7 days)
//    Pediatric : ageMin 0.02   → ageMax 13    (~7 days–13 yr)
//    Adult     : ageMin 13     (≥13 yr, split by sex where needed)
// ═══════════════════════════════════════════════════════════
const FBC_RANGES = {

  // ── Core CBC ──────────────────────────────────────────────

  WBC: {
    unit: 'x10⁹/L',
    referenceRanges: [
      { ageGroup: 'Neonatal (0-7 days)',  ageMin: 0,    ageMax: 0.02, gender: 'all', range: '4.00-20.00', unit: 'x10⁹/L', criticalLow: '2.0', criticalHigh: '30.0' },
      { ageGroup: 'Pediatric (7d-13yr)', ageMin: 0.02, ageMax: 13,   gender: 'all', range: '4.00-12.00', unit: 'x10⁹/L', criticalLow: '2.0', criticalHigh: '30.0' },
      { ageGroup: 'Adult Female',         ageMin: 13,                  gender: 'F',   range: '3.50-9.50',  unit: 'x10⁹/L', criticalLow: '2.0', criticalHigh: '30.0' },
      { ageGroup: 'Adult Male',           ageMin: 13,                  gender: 'M',   range: '4.00-11.00', unit: 'x10⁹/L', criticalLow: '2.0', criticalHigh: '30.0' },
    ],
  },

  HB: {
    unit: 'g/dL',
    referenceRanges: [
      { ageGroup: 'Neonatal (0-7 days)',  ageMin: 0,    ageMax: 0.02, gender: 'all', range: '17.0-20.0', unit: 'g/dL', criticalLow: '7.0', criticalHigh: '24.0' },
      { ageGroup: 'Pediatric (7d-13yr)', ageMin: 0.02, ageMax: 13,   gender: 'all', range: '12.0-16.0', unit: 'g/dL', criticalLow: '7.0', criticalHigh: '20.0' },
      { ageGroup: 'Adult Female',         ageMin: 13,                  gender: 'F',   range: '11.5-15.0', unit: 'g/dL', criticalLow: '7.0', criticalHigh: '20.0' },
      { ageGroup: 'Adult Male',           ageMin: 13,                  gender: 'M',   range: '13.5-17.5', unit: 'g/dL', criticalLow: '7.0', criticalHigh: '20.0' },
    ],
  },

  HCT: {
    unit: '%',
    referenceRanges: [
      { ageGroup: 'Neonatal (0-7 days)',  ageMin: 0,    ageMax: 0.02, gender: 'all', range: '38.0-68.0', unit: '%', criticalLow: '20', criticalHigh: '70' },
      { ageGroup: 'Pediatric (7d-13yr)', ageMin: 0.02, ageMax: 13,   gender: 'all', range: '35.0-49.0', unit: '%', criticalLow: '20', criticalHigh: '60' },
      { ageGroup: 'Adult Female',         ageMin: 13,                  gender: 'F',   range: '35.0-45.0', unit: '%', criticalLow: '20', criticalHigh: '60' },
      { ageGroup: 'Adult Male',           ageMin: 13,                  gender: 'M',   range: '40.0-54.0', unit: '%', criticalLow: '20', criticalHigh: '60' },
    ],
  },

  RBC: {
    unit: 'x10¹²/L',
    referenceRanges: [
      { ageGroup: 'Neonatal (0-7 days)',  ageMin: 0,    ageMax: 0.02, gender: 'all', range: '3.50-7.00', unit: 'x10¹²/L' },
      { ageGroup: 'Pediatric (7d-13yr)', ageMin: 0.02, ageMax: 13,   gender: 'all', range: '3.50-5.20', unit: 'x10¹²/L' },
      { ageGroup: 'Adult Female',         ageMin: 13,                  gender: 'F',   range: '3.80-5.10', unit: 'x10¹²/L' },
      { ageGroup: 'Adult Male',           ageMin: 13,                  gender: 'M',   range: '4.50-5.90', unit: 'x10¹²/L' },
    ],
  },

  PLT: {
    unit: 'x10⁹/L',
    referenceRanges: [
      { ageGroup: 'Neonatal (0-7 days)',  ageMin: 0,    ageMax: 0.02, gender: 'all', range: '100-300', unit: 'x10⁹/L', criticalLow: '50', criticalHigh: '1000' },
      { ageGroup: 'Pediatric (7d-13yr)', ageMin: 0.02, ageMax: 13,   gender: 'all', range: '100-300', unit: 'x10⁹/L', criticalLow: '50', criticalHigh: '1000' },
      { ageGroup: 'Adult',               ageMin: 13,                  gender: 'all', range: '125-350', unit: 'x10⁹/L', criticalLow: '50', criticalHigh: '1000' },
    ],
  },

  // ── RBC indices ──────────────────────────────────────────

  MCV: {
    unit: 'fL',
    referenceRanges: [
      { ageGroup: 'Neonatal (0-7 days)',  ageMin: 0,    ageMax: 0.02, gender: 'all', range: '95.0-125.0', unit: 'fL' },
      { ageGroup: 'Pediatric (7d-13yr)', ageMin: 0.02, ageMax: 13,   gender: 'all', range: '80.0-100.0', unit: 'fL' },
      { ageGroup: 'Adult',               ageMin: 13,                  gender: 'all', range: '82.0-100.0', unit: 'fL' },
    ],
  },

  MCH: {
    unit: 'pg',
    referenceRanges: [
      { ageGroup: 'Neonatal (0-7 days)',  ageMin: 0,    ageMax: 0.02, gender: 'all', range: '30.0-42.0', unit: 'pg' },
      { ageGroup: 'Pediatric (7d-13yr)', ageMin: 0.02, ageMax: 13,   gender: 'all', range: '27.0-34.0', unit: 'pg' },
      { ageGroup: 'Adult',               ageMin: 13,                  gender: 'all', range: '27.0-34.0', unit: 'pg' },
    ],
  },

  MCHC: {
    // Analyzer reports in g/L — NOT g/dL. 32-36 g/dL = 320-360 g/L.
    // Exact ranges from printouts: neonatal 300-340, pediatric 310-370, adult 316-354.
    unit: 'g/L',
    referenceRanges: [
      { ageGroup: 'Neonatal (0-7 days)',  ageMin: 0,    ageMax: 0.02, gender: 'all', range: '300-340', unit: 'g/L' },
      { ageGroup: 'Pediatric (7d-13yr)', ageMin: 0.02, ageMax: 13,   gender: 'all', range: '310-370', unit: 'g/L' },
      { ageGroup: 'Adult',               ageMin: 13,                  gender: 'all', range: '316-354', unit: 'g/L' },
    ],
  },

  RDWCV: {
    unit: '%',
    referenceRanges: [
      { ageGroup: 'All ages', ageMin: 0, gender: 'all', range: '11.0-16.0', unit: '%' },
    ],
  },

  RDWSD: {
    unit: 'fL',
    referenceRanges: [
      { ageGroup: 'All ages', ageMin: 0, gender: 'all', range: '35.0-56.0', unit: 'fL' },
    ],
  },

  // ── PLT indices ──────────────────────────────────────────

  MPV: {
    unit: 'fL',
    referenceRanges: [
      { ageGroup: 'All ages', ageMin: 0, gender: 'all', range: '6.5-12.0', unit: 'fL' },
    ],
  },

  PDW: {
    unit: 'fL',
    referenceRanges: [
      { ageGroup: 'All ages', ageMin: 0, gender: 'all', range: '9.0-17.0', unit: 'fL' },
    ],
  },

  PLTCT: {
    // PCT field — analyzer labels it ml/L (equivalent to ‰).
    // Was stored as 0.10-0.40 % which is incorrect.
    unit: 'ml/L',
    referenceRanges: [
      { ageGroup: 'All ages', ageMin: 0, gender: 'all', range: '1.08-2.82', unit: 'ml/L' },
    ],
  },

  PLCC: {
    unit: 'x10⁹/L',
    referenceRanges: [
      { ageGroup: 'All ages', ageMin: 0, gender: 'all', range: '30-90', unit: 'x10⁹/L' },
    ],
  },

  PLCR: {
    unit: '%',
    referenceRanges: [
      { ageGroup: 'All ages', ageMin: 0, gender: 'all', range: '11.0-45.0', unit: '%' },
    ],
  },

  // ── Absolute differential counts (# series) ──────────────

  NEUTA: {
    unit: 'x10⁹/L',
    referenceRanges: [
      { ageGroup: 'Neonatal (0-7 days)',  ageMin: 0,    ageMax: 0.02, gender: 'all', range: '1.60-16.00', unit: 'x10⁹/L', criticalLow: '1.0' },
      { ageGroup: 'Pediatric (7d-13yr)', ageMin: 0.02, ageMax: 13,   gender: 'all', range: '2.00-8.00',  unit: 'x10⁹/L', criticalLow: '1.0' },
      { ageGroup: 'Adult',               ageMin: 13,                  gender: 'all', range: '1.80-6.30',  unit: 'x10⁹/L', criticalLow: '1.0' },
    ],
  },

  LYMPHA: {
    unit: 'x10⁹/L',
    referenceRanges: [
      { ageGroup: 'Neonatal (0-7 days)',  ageMin: 0,    ageMax: 0.02, gender: 'all', range: '0.40-12.00', unit: 'x10⁹/L' },
      { ageGroup: 'Pediatric (7d-13yr)', ageMin: 0.02, ageMax: 13,   gender: 'all', range: '0.80-7.00',  unit: 'x10⁹/L' },
      { ageGroup: 'Adult',               ageMin: 13,                  gender: 'all', range: '1.10-3.20',  unit: 'x10⁹/L' },
    ],
  },

  MONOA: {
    unit: 'x10⁹/L',
    referenceRanges: [
      { ageGroup: 'Neonatal (0-7 days)',  ageMin: 0,    ageMax: 0.02, gender: 'all', range: '0.12-2.50', unit: 'x10⁹/L' },
      { ageGroup: 'Pediatric (7d-13yr)', ageMin: 0.02, ageMax: 13,   gender: 'all', range: '0.12-1.20', unit: 'x10⁹/L' },
      { ageGroup: 'Adult',               ageMin: 13,                  gender: 'all', range: '0.10-0.60', unit: 'x10⁹/L' },
    ],
  },

  EOSA: {
    unit: 'x10⁹/L',
    referenceRanges: [
      { ageGroup: 'Neonatal (0-7 days)',  ageMin: 0,    ageMax: 0.02, gender: 'all', range: '0.02-0.80', unit: 'x10⁹/L' },
      { ageGroup: 'Pediatric (7d-13yr)', ageMin: 0.02, ageMax: 13,   gender: 'all', range: '0.02-0.80', unit: 'x10⁹/L' },
      { ageGroup: 'Adult',               ageMin: 13,                  gender: 'all', range: '0.02-0.52', unit: 'x10⁹/L' },
    ],
  },

  BASOA: {
    unit: 'x10⁹/L',
    referenceRanges: [
      { ageGroup: 'Neonatal (0-7 days)',  ageMin: 0,    ageMax: 0.02, gender: 'all', range: '0.00-0.20', unit: 'x10⁹/L' },
      { ageGroup: 'Pediatric (7d-13yr)', ageMin: 0.02, ageMax: 13,   gender: 'all', range: '0.00-0.10', unit: 'x10⁹/L' },
      { ageGroup: 'Adult',               ageMin: 13,                  gender: 'all', range: '0.00-0.06', unit: 'x10⁹/L' },
    ],
  },

  // ── Differential percentages (% series) ──────────────────

  NEUT: {
    unit: '%',
    referenceRanges: [
      { ageGroup: 'Neonatal (0-7 days)',  ageMin: 0,    ageMax: 0.02, gender: 'all', range: '40.0-80.0', unit: '%' },
      { ageGroup: 'Pediatric (7d-13yr)', ageMin: 0.02, ageMax: 13,   gender: 'all', range: '50.0-70.0', unit: '%' },
      { ageGroup: 'Adult',               ageMin: 13,                  gender: 'all', range: '40.0-75.0', unit: '%' },
    ],
  },

  LYMPH: {
    unit: '%',
    referenceRanges: [
      { ageGroup: 'Neonatal (0-7 days)',  ageMin: 0,    ageMax: 0.02, gender: 'all', range: '10.0-60.0', unit: '%' },
      { ageGroup: 'Pediatric (7d-13yr)', ageMin: 0.02, ageMax: 13,   gender: 'all', range: '20.0-60.0', unit: '%' },
      { ageGroup: 'Adult',               ageMin: 13,                  gender: 'all', range: '20.0-50.0', unit: '%' },
    ],
  },

  MONO: {
    unit: '%',
    referenceRanges: [
      { ageGroup: 'Neonatal (0-7 days)',  ageMin: 0,    ageMax: 0.02, gender: 'all', range: '3.0-13.0', unit: '%' },
      { ageGroup: 'Pediatric (7d-13yr)', ageMin: 0.02, ageMax: 13,   gender: 'all', range: '3.0-12.0', unit: '%' },
      { ageGroup: 'Adult',               ageMin: 13,                  gender: 'all', range: '3.0-10.0', unit: '%' },
    ],
  },

  EOS: {
    unit: '%',
    referenceRanges: [
      { ageGroup: 'Neonatal (0-7 days)',  ageMin: 0,    ageMax: 0.02, gender: 'all', range: '0.5-5.0', unit: '%' },
      { ageGroup: 'Pediatric (7d-13yr)', ageMin: 0.02, ageMax: 13,   gender: 'all', range: '0.5-5.0', unit: '%' },
      { ageGroup: 'Adult',               ageMin: 13,                  gender: 'all', range: '0.4-8.0', unit: '%' },
    ],
  },

  BASO: {
    unit: '%',
    referenceRanges: [
      { ageGroup: 'All ages', ageMin: 0, gender: 'all', range: '0.0-1.0', unit: '%' },
    ],
  },
};

// ═══════════════════════════════════════════════════════════
//  SECTION 2 — FBC panel test order (matches analyzer output)
// ═══════════════════════════════════════════════════════════
const FBC_ORDER = [
  // WBC first
  'WBC',
  // Absolute differential counts (#)
  'NEUTA', 'LYMPHA', 'MONOA', 'EOSA', 'BASOA',
  // Differential percentages (%)
  'NEUT', 'LYMPH', 'MONO', 'EOS', 'BASO',
  // Red cell series
  'RBC', 'HB', 'HCT', 'MCV', 'MCH', 'MCHC', 'RDWCV', 'RDWSD',
  // Platelet series
  'PLT', 'MPV', 'PDW', 'PLTCT', 'PLCC', 'PLCR',
];

// ── Helper ─────────────────────────────────────────────────
const sep = (ch = '─') => ch.repeat(64);

// ── Main ───────────────────────────────────────────────────
async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log('✔ Connected to MongoDB');
  console.log(sep('═'));
  console.log('  FIX-FBC  —  Zybio ZS-2 reference-range & panel alignment');
  console.log(sep('═'));

  const catalog = mongoose.connection.collection('test_catalog');
  const panels  = mongoose.connection.collection('test_panels');
  let changes = 0;

  // ────────────────────────────────────────────────────────
  //  1. Update reference ranges + units
  // ────────────────────────────────────────────────────────
  console.log('\n[1/2]  Updating reference ranges…');
  console.log(sep());

  for (const [code, data] of Object.entries(FBC_RANGES)) {
    const res = await catalog.updateOne(
      { code },
      { $set: { unit: data.unit, referenceRanges: data.referenceRanges } },
    );
    if (res.matchedCount === 0) {
      console.log(`  ${code.padEnd(10)}  ⚠️  not found — skipped`);
    } else if (res.modifiedCount > 0) {
      console.log(`  ${code.padEnd(10)}  ✅ updated  (${data.referenceRanges.length} range group${data.referenceRanges.length > 1 ? 's' : ''})`);
      changes++;
    } else {
      console.log(`  ${code.padEnd(10)}  — already current`);
    }
  }

  // ────────────────────────────────────────────────────────
  //  2. Reorder FBC panel
  // ────────────────────────────────────────────────────────
  console.log(`\n[2/2]  Reordering FBC panel…`);
  console.log(sep());

  const newTests = [];
  for (const code of FBC_ORDER) {
    const doc = await catalog.findOne({ code });
    if (!doc) {
      console.log(`  ${code.padEnd(10)}  ⚠️  not found in test_catalog — skipped`);
      continue;
    }
    newTests.push({ testId: doc._id.toString(), testCode: doc.code, testName: doc.name });
    console.log(`  ${String(newTests.length).padStart(2)}. ${code.padEnd(10)}  ${doc.name}`);
  }

  const panelRes = await panels.updateOne({ code: 'FBC' }, { $set: { tests: newTests } });
  if (panelRes.matchedCount === 0) {
    console.log('\n  ⚠️  FBC panel not found in test_panels');
  } else if (panelRes.modifiedCount > 0) {
    console.log(`\n  ✅ FBC panel updated — ${newTests.length} tests in new order`);
    changes++;
  } else {
    console.log('\n  FBC panel already in correct order');
  }

  // ── Summary ───────────────────────────────────────────────
  console.log(`\n${sep('═')}`);
  console.log('  DONE');
  console.log(sep('═'));
  console.log(`  Total changes applied: ${changes}`);

  const active   = await catalog.countDocuments({ isActive: true });
  const inactive = await catalog.countDocuments({ isActive: false });
  console.log(`\n  test_catalog  →  ${active} active  /  ${inactive} inactive`);

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
