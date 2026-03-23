import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TestCatalog } from './schemas/test-catalog.schema';
import { TestPanel } from './schemas/test-panel.schema';

async function fixCatalogAndPanels() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const testCatalogModel = app.get<Model<TestCatalog>>(getModelToken(TestCatalog.name));
  const testPanelModel = app.get<Model<TestPanel>>(getModelToken(TestPanel.name));

  console.log('🔧 Fixing Test Catalog and Panels...\n');

  try {
    // ==================== 1. ADD FBC TESTS (NOT INDIVIDUALLY ORDERABLE) ====================
    console.log('📋 1. Adding FBC Tests (not individually orderable)...');
    
    const fbcTests = [
      { code: 'WBC', name: 'White Blood Cell Count', unit: '10^9/L', range: '4.0-11.0', criticalLow: '2.0', criticalHigh: '30.0' },
      { code: 'NEUTA', name: 'Neutrophils #', unit: '10^9/L', range: '2.0-7.5', criticalLow: '1.0', criticalHigh: '15.0' },
      { code: 'LYMPHA', name: 'Lymphocytes #', unit: '10^9/L', range: '1.0-4.0', criticalLow: '0.5', criticalHigh: '10.0' },
      { code: 'MONOA', name: 'Monocytes #', unit: '10^9/L', range: '0.2-1.0', criticalLow: '0.0', criticalHigh: '2.0' },
      { code: 'EOSA', name: 'Eosinophils #', unit: '10^9/L', range: '0.0-0.5', criticalLow: '0.0', criticalHigh: '2.0' },
      { code: 'BASOA', name: 'Basophils #', unit: '10^9/L', range: '0.0-0.2', criticalLow: '0.0', criticalHigh: '0.5' },
      { code: 'NEUT', name: 'Neutrophils %', unit: '%', range: '40-75', criticalLow: '20', criticalHigh: '90' },
      { code: 'LYMPH', name: 'Lymphocytes %', unit: '%', range: '20-45', criticalLow: '10', criticalHigh: '70' },
      { code: 'MONO', name: 'Monocytes %', unit: '%', range: '2-10', criticalLow: '0', criticalHigh: '20' },
      { code: 'EOS', name: 'Eosinophils %', unit: '%', range: '0-6', criticalLow: '0', criticalHigh: '15' },
      { code: 'BASO', name: 'Basophils %', unit: '%', range: '0-2', criticalLow: '0', criticalHigh: '5' },
      { code: 'RBC', name: 'Red Blood Cell Count', unit: '10^12/L', range: '4.5-5.5', criticalLow: '2.5', criticalHigh: '7.0' },
      { code: 'HB', name: 'Hemoglobin', unit: 'g/dL', range: '13.0-17.0', criticalLow: '7.0', criticalHigh: '20.0' },
      { code: 'HCT', name: 'Hematocrit', unit: '%', range: '40-52', criticalLow: '20', criticalHigh: '60' },
      { code: 'MCV', name: 'Mean Corpuscular Volume', unit: 'fL', range: '80-100', criticalLow: '60', criticalHigh: '120' },
      { code: 'MCH', name: 'Mean Corpuscular Hemoglobin', unit: 'pg', range: '27-32', criticalLow: '20', criticalHigh: '40' },
      { code: 'MCHC', name: 'Mean Corpuscular Hemoglobin Concentration', unit: 'g/dL', range: '32-36', criticalLow: '28', criticalHigh: '40' },
      { code: 'RDWCV', name: 'Red Cell Distribution Width - CV', unit: '%', range: '11.5-14.5', criticalLow: '10', criticalHigh: '20' },
      { code: 'RDWSD', name: 'Red Cell Distribution Width - SD', unit: 'fL', range: '39-46', criticalLow: '30', criticalHigh: '60' },
      { code: 'PLT', name: 'Platelet Count', unit: '10^9/L', range: '150-400', criticalLow: '50', criticalHigh: '1000' },
      { code: 'MPV', name: 'Mean Platelet Volume', unit: 'fL', range: '7.5-11.5', criticalLow: '5', criticalHigh: '15' },
      { code: 'PDW', name: 'Platelet Distribution Width', unit: '%', range: '10-18', criticalLow: '5', criticalHigh: '25' },
      { code: 'PLTCT', name: 'Plateletcrit', unit: '%', range: '0.15-0.40', criticalLow: '0.05', criticalHigh: '0.60' },
      { code: 'PLCC', name: 'Platelet Large Cell Count', unit: '10^9/L', range: '30-90', criticalLow: '10', criticalHigh: '150' },
      { code: 'PLCR', name: 'Platelet Large Cell Ratio', unit: '%', range: '15-35', criticalLow: '5', criticalHigh: '50' },
    ];

    for (const test of fbcTests) {
      await testCatalogModel.updateOne(
        { code: test.code },
        {
          $set: {
            code: test.code,
            name: test.name,
            category: 'hematology',
            price: 0, // Not individually orderable
            sampleType: 'blood',
            turnaroundTime: 30,
            isActive: false, // Cannot be ordered individually
            unit: test.unit,
            referenceRanges: [
              {
                ageGroup: 'All ages',
                ageMin: 0,
                gender: 'all',
                range: test.range,
                unit: test.unit,
                criticalLow: test.criticalLow,
                criticalHigh: test.criticalHigh,
              },
            ],
          },
        },
        { upsert: true }
      );
      console.log(`   ✅ ${test.code} - ${test.name}`);
    }

    // ==================== 2. ADD RFT TESTS (INDIVIDUALLY ORDERABLE) ====================
    console.log('\n📋 2. Adding RFT Tests (individually orderable)...');
    
    const rftTests = [
      { code: 'UREA', name: 'Urea', unit: 'mmol/L', range: '2.5-7.8', criticalLow: '1.0', criticalHigh: '30.0', price: 80 },
      { code: 'CREAT', name: 'Creatinine', unit: 'µmol/L', range: '62-106', criticalLow: '30', criticalHigh: '500', price: 90 },
      { code: 'HCO3', name: 'Bicarbonate', unit: 'mmol/L', range: '22-29', criticalLow: '15', criticalHigh: '40', price: 35 },
      { code: 'UA', name: 'Uric Acid', unit: 'µmol/L', range: '208-428', criticalLow: '100', criticalHigh: '600', price: 80 },
    ];

    for (const test of rftTests) {
      await testCatalogModel.updateOne(
        { code: test.code },
        {
          $set: {
            code: test.code,
            name: test.name,
            category: 'chemistry',
            price: test.price,
            sampleType: 'blood',
            turnaroundTime: 120,
            isActive: true, // Can be ordered individually
            unit: test.unit,
            referenceRanges: [
              {
                ageGroup: 'All ages',
                ageMin: 0,
                gender: 'all',
                range: test.range,
                unit: test.unit,
                criticalLow: test.criticalLow,
                criticalHigh: test.criticalHigh,
              },
            ],
          },
        },
        { upsert: true }
      );
      console.log(`   ✅ ${test.code} - ${test.name} (Price: ${test.price})`);
    }

    // ==================== 3. ENSURE LFT TESTS ARE NOT INDIVIDUALLY ORDERABLE ====================
    console.log('\n📋 3. Ensuring LFT Tests are not individually orderable...');
    
    const lftCodes = ['ALT', 'AST', 'ALP', 'ALB', 'TBIL', 'DBIL', 'GGT', 'TP'];
    
    for (const code of lftCodes) {
      const result = await testCatalogModel.updateOne(
        { code },
        {
          $set: {
            price: 0,
            isActive: false,
          },
        }
      );
      
      if (result.modifiedCount > 0) {
        console.log(`   ✅ ${code} - Set to not individually orderable`);
      }
    }

    // ==================== 4. REMOVE SEROLOGY PANEL ====================
    console.log('\n📋 4. Removing Serology Panel...');
    
    const serologyResult = await testPanelModel.deleteOne({ code: 'SEROLOGY' });
    
    if (serologyResult.deletedCount > 0) {
      console.log('   ✅ Serology panel removed');
    } else {
      console.log('   ℹ️  Serology panel not found (may already be removed)');
    }

    // ==================== 5. UPDATE RFT PANEL ====================
    console.log('\n📋 5. Updating RFT Panel...');
    
    const rftTestCodes = ['UREA', 'CREAT', 'NA', 'K', 'CL', 'HCO3', 'UA'];
    const rftTestDocs = await testCatalogModel.find({ code: { $in: rftTestCodes } }).exec();
    
    const rftPanelTests = rftTestDocs.map(test => ({
      testId: test._id,
      testCode: test.code,
      testName: test.name,
    }));

    await testPanelModel.updateOne(
      { code: 'RFT' },
      {
        $set: {
          code: 'RFT',
          name: 'Renal Function Test',
          description: 'Kidney function panel - Urea, Creatinine, Electrolytes, Bicarbonate, Uric Acid',
          price: 390, // UREA(80) + CREAT(90) + NA(35) + K(35) + CL(35) + HCO3(35) + UA(80)
          isActive: true,
          tests: rftPanelTests,
        },
      },
      { upsert: true }
    );
    
    console.log(`   ✅ RFT Panel updated with ${rftPanelTests.length} tests`);

    // ==================== VERIFICATION ====================
    console.log('\n🔍 Verification:');
    
    const fbcCount = await testCatalogModel.countDocuments({ 
      code: { $in: fbcTests.map(t => t.code) } 
    });
    console.log(`   FBC tests in catalog: ${fbcCount}/${fbcTests.length}`);
    
    const rftCount = await testCatalogModel.countDocuments({ 
      code: { $in: rftTests.map(t => t.code) } 
    });
    console.log(`   RFT tests in catalog: ${rftCount}/${rftTests.length}`);
    
    const lftNotOrderable = await testCatalogModel.countDocuments({ 
      code: { $in: lftCodes },
      isActive: false,
      price: 0
    });
    console.log(`   LFT tests not individually orderable: ${lftNotOrderable}/${lftCodes.length}`);
    
    const serologyPanel = await testPanelModel.findOne({ code: 'SEROLOGY' });
    console.log(`   Serology panel exists: ${serologyPanel ? '❌ YES (ERROR)' : '✅ NO (CORRECT)'}`);

    console.log('\n✅ All fixes completed successfully!');

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await app.close();
  }
}

fixCatalogAndPanels()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
