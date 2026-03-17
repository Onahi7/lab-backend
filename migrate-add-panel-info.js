/**
 * Migration: Add Panel Information to Test Catalog and Results
 * Adds panelCode and panelName to tests and backfills existing results
 */

const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb+srv://mmmnigeriaschool12_db_user:Iamhardy_7*@cluster0.abdi7yt.mongodb.net/carefaamlab?retryWrites=true&w=majority&appName=Cluster0&ssl=true&authSource=admin';

// Panel definitions based on common lab test groupings
const PANEL_MAPPINGS = {
  // Full Blood Count (FBC) - Hematology
  'FBC': {
    panelCode: 'FBC',
    panelName: 'FULL BLOOD COUNT',
    tests: ['WBC', 'RBC', 'HB', 'HGB', 'HCT', 'MCV', 'MCH', 'MCHC', 'PLT', 'NEUT', 'LYMPH', 'MONO', 'EOS', 'BASO',
            'NEUT%', 'LYMPH%', 'MONO%', 'EOS%', 'BASO%', 'RDW', 'MPV', 'PDW', 'PCT', 'P-LCR', 'P-LCC']
  },
  
  // Liver Function Test (LFT) - Chemistry
  'LFT': {
    panelCode: 'LFT',
    panelName: 'LIVER FUNCTION TEST',
    tests: ['ALT', 'AST', 'ALP', 'GGT', 'TBIL', 'DBIL', 'IBIL', 'TP', 'ALB', 'GLOB']
  },
  
  // Renal Function Test (RFT) - Chemistry
  'RFT': {
    panelCode: 'RFT',
    panelName: 'RENAL FUNCTION TEST',
    tests: ['CREAT', 'UREA', 'BUN', 'UA', 'NA', 'K', 'CL', 'HCO3', 'CA', 'PHOS']
  },
  
  // Lipid Profile - Chemistry
  'LIPID': {
    panelCode: 'LIPID',
    panelName: 'LIPID PROFILE',
    tests: ['CHOL', 'TRIG', 'HDL', 'LDL', 'VLDL', 'CHOL/HDL']
  },
  
  // Thyroid Function Test (TFT) - Immunoassay
  'TFT': {
    panelCode: 'TFT',
    panelName: 'THYROID FUNCTION TEST',
    tests: ['TSH', 'T3', 'T4', 'FT3', 'FT4']
  },
  
  // Diabetes Panel - Chemistry
  'DIABETES': {
    panelCode: 'DIABETES',
    panelName: 'DIABETES PANEL',
    tests: ['GLU', 'FBS', 'RBS', 'HBA1C', 'OGTT']
  },
  
  // Electrolytes - Chemistry
  'ELECTROLYTES': {
    panelCode: 'ELECTROLYTES',
    panelName: 'ELECTROLYTES',
    tests: ['NA', 'K', 'CL', 'HCO3', 'CA', 'MG', 'PHOS']
  },
  
  // Cardiac Markers - Immunoassay
  'CARDIAC': {
    panelCode: 'CARDIAC',
    panelName: 'CARDIAC MARKERS',
    tests: ['TROP-I', 'TROP-T', 'CK', 'CK-MB', 'LDH', 'BNP', 'NT-PROBNP']
  },
  
  // Coagulation Profile - Hematology
  'COAG': {
    panelCode: 'COAG',
    panelName: 'COAGULATION PROFILE',
    tests: ['PT', 'PTT', 'APTT', 'INR', 'FIBRINOGEN', 'D-DIMER']
  },
  
  // Urinalysis - Urinalysis
  'URINALYSIS': {
    panelCode: 'URINALYSIS',
    panelName: 'URINALYSIS',
    tests: ['URINE-COLOR', 'URINE-CLARITY', 'URINE-PH', 'URINE-SG', 'URINE-PROTEIN', 'URINE-GLUCOSE',
            'URINE-KETONES', 'URINE-BLOOD', 'URINE-BILI', 'URINE-URO', 'URINE-NITRITE', 'URINE-LE',
            'URINE-WBC', 'URINE-RBC', 'URINE-EPI', 'URINE-BACTERIA', 'URINE-CASTS', 'URINE-CRYSTALS']
  },
  
  // Hepatitis Panel - Serology
  'HEPATITIS': {
    panelCode: 'HEPATITIS',
    panelName: 'HEPATITIS PANEL',
    tests: ['HBSAG', 'HBSAB', 'HBCAB', 'HBEAG', 'HBEAB', 'HCV', 'HCV-AB']
  },
  
  // HIV Testing - Serology
  'HIV': {
    panelCode: 'HIV',
    panelName: 'HIV SCREENING',
    tests: ['HIV', 'HIV-1', 'HIV-2', 'HIVP24', 'HIV-RNA']
  },
  
  // Malaria - Parasitology
  'MALARIA': {
    panelCode: 'MALARIA',
    panelName: 'MALARIA TEST',
    tests: ['MALARIA', 'MALARIA-RDT', 'MALARIA-MICROSCOPY']
  },
  
  // Pregnancy Test - Immunoassay
  'PREGNANCY': {
    panelCode: 'PREGNANCY',
    panelName: 'PREGNANCY TEST',
    tests: ['HCG', 'BHCG', 'PREGNANCY']
  },
  
  // Tumor Markers - Immunoassay
  'TUMOR': {
    panelCode: 'TUMOR',
    panelName: 'TUMOR MARKERS',
    tests: ['CEA', 'AFP', 'CA125', 'CA19-9', 'PSA', 'CA15-3']
  },
  
  // Hormones - Immunoassay
  'HORMONES': {
    panelCode: 'HORMONES',
    panelName: 'HORMONE PANEL',
    tests: ['FSH', 'LH', 'PROLACTIN', 'ESTRADIOL', 'PROGESTERONE', 'TESTOSTERONE', 'CORTISOL']
  }
};

// Build reverse lookup: testCode -> panel info
const testToPanelMap = {};
Object.entries(PANEL_MAPPINGS).forEach(([panelKey, panelInfo]) => {
  panelInfo.tests.forEach(testCode => {
    testToPanelMap[testCode] = {
      panelCode: panelInfo.panelCode,
      panelName: panelInfo.panelName
    };
  });
});

async function main() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;

    console.log('═'.repeat(80));
    console.log('MIGRATION: ADD PANEL INFORMATION');
    console.log('═'.repeat(80));

    // Step 1: Update Test Catalog
    console.log('\n📚 Step 1: Updating Test Catalog...\n');
    
    const testCatalog = await db.collection('test_catalog').find({}).toArray();
    let catalogUpdated = 0;
    let catalogSkipped = 0;

    for (const test of testCatalog) {
      const panelInfo = testToPanelMap[test.code];
      
      if (panelInfo) {
        await db.collection('test_catalog').updateOne(
          { _id: test._id },
          { 
            $set: { 
              panelCode: panelInfo.panelCode,
              panelName: panelInfo.panelName
            } 
          }
        );
        console.log(`   ✅ ${test.code.padEnd(20)} → ${panelInfo.panelName}`);
        catalogUpdated++;
      } else {
        console.log(`   ⚠️  ${test.code.padEnd(20)} → No panel mapping found`);
        catalogSkipped++;
      }
    }

    console.log(`\n   Updated: ${catalogUpdated}/${testCatalog.length} tests`);
    console.log(`   Skipped: ${catalogSkipped}/${testCatalog.length} tests (no panel mapping)`);

    // Step 2: Backfill Existing Results
    console.log('\n📊 Step 2: Backfilling Existing Results...\n');
    
    const results = await db.collection('results').find({}).toArray();
    let resultsUpdated = 0;
    let resultsSkipped = 0;

    for (const result of results) {
      const panelInfo = testToPanelMap[result.testCode];
      
      if (panelInfo) {
        await db.collection('results').updateOne(
          { _id: result._id },
          { 
            $set: { 
              panelCode: panelInfo.panelCode,
              panelName: panelInfo.panelName
            } 
          }
        );
        resultsUpdated++;
        
        if (resultsUpdated <= 10) {
          console.log(`   ✅ Result ${result._id} (${result.testCode}) → ${panelInfo.panelName}`);
        }
      } else {
        resultsSkipped++;
        
        if (resultsSkipped <= 5) {
          console.log(`   ⚠️  Result ${result._id} (${result.testCode}) → No panel mapping`);
        }
      }
    }

    console.log(`\n   Updated: ${resultsUpdated}/${results.length} results`);
    console.log(`   Skipped: ${resultsSkipped}/${results.length} results (no panel mapping)`);

    // Step 3: Verification
    console.log('\n✅ Step 3: Verification...\n');
    
    const catalogWithPanel = await db.collection('test_catalog').countDocuments({
      $or: [{ panelCode: { $exists: true, $ne: null } }, { panelName: { $exists: true, $ne: null } }]
    });
    
    const resultsWithPanel = await db.collection('results').countDocuments({
      $or: [{ panelCode: { $exists: true, $ne: null } }, { panelName: { $exists: true, $ne: null } }]
    });

    console.log(`   Test Catalog with panel info: ${catalogWithPanel}/${testCatalog.length}`);
    console.log(`   Results with panel info: ${resultsWithPanel}/${results.length}`);

    // Show panel distribution
    console.log('\n📋 Panel Distribution in Results:\n');
    
    const panelCounts = await db.collection('results').aggregate([
      { $match: { panelCode: { $exists: true, $ne: null } } },
      { $group: { _id: '$panelName', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]).toArray();

    panelCounts.forEach(panel => {
      console.log(`   ${panel._id.padEnd(30)} ${panel.count} results`);
    });

    console.log('\n' + '═'.repeat(80));
    console.log('MIGRATION COMPLETE');
    console.log('═'.repeat(80));
    console.log(`\n✅ Test Catalog: ${catalogUpdated} tests updated`);
    console.log(`✅ Results: ${resultsUpdated} results updated`);
    console.log(`\n💡 All existing results now have panel information!`);
    console.log(`   Reports will display panel headings correctly.`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

main();
