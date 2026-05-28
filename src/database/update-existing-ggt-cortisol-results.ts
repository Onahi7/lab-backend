import { NestFactory } from '@nestjs/core';
import { Model } from 'mongoose';
import { AppModule } from '../app.module';
import { Result } from './schemas/result.schema';
import { ResultsService } from '../results/results.service';

const GGT_CODE = 'GGT';
const GGT_RANGE = '8-61';
const GGT_UNIT = 'U/L';

const CORTISOL_CODE = 'CORTISOL';
const CORTISOL_DEFAULT_PHASE = '7am-10am';
const CORTISOL_MORNING_RANGE = '134-522';
const CORTISOL_EVENING_RANGE = '77-317';
const CORTISOL_UNIT = 'nmol/L';

async function updateExistingGgtAndCortisolResults() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const resultModel = app.get<Model<Result>>('ResultModel');
  const resultsService = app.get(ResultsService);

  console.log('\nUpdating existing GGT and CORTISOL results...\n');

  try {
    const ggtResults = await resultModel
      .find({ testCode: GGT_CODE })
      .select('_id value unit referenceRange flag')
      .lean();

    let ggtFlagChanges = 0;
    const ggtBulkOps = ggtResults.flatMap((result: any) => {
      const updateSet: Record<string, any> = {};
      const nextFlag = resultsService.calculateFlag(String(result.value || ''), GGT_RANGE);

      if ((result.referenceRange || '').trim() !== GGT_RANGE) {
        updateSet.referenceRange = GGT_RANGE;
      }

      if ((result.unit || '').trim() !== GGT_UNIT) {
        updateSet.unit = GGT_UNIT;
      }

      if (result.flag !== nextFlag) {
        updateSet.flag = nextFlag;
        ggtFlagChanges += 1;
      }

      if (Object.keys(updateSet).length === 0) {
        return [];
      }

      return [
        {
          updateOne: {
            filter: { _id: result._id },
            update: { $set: updateSet },
          },
        },
      ];
    });

    if (ggtBulkOps.length > 0) {
      await resultModel.bulkWrite(ggtBulkOps);
    }

    console.log(`  [GGT] Found ${ggtResults.length}, updated ${ggtBulkOps.length}, flags changed ${ggtFlagChanges}`);

    const cortisolResults = await resultModel
      .find({ testCode: CORTISOL_CODE })
      .select('_id value unit referenceRange flag menstrualPhase allReferenceRanges')
      .lean();

    const cortisolAllRanges = JSON.stringify([
      { ageGroup: '7am to 10am', range: CORTISOL_MORNING_RANGE, unit: CORTISOL_UNIT, gender: 'all', condition: '7am-10am' },
      { ageGroup: '4pm to 8pm', range: CORTISOL_EVENING_RANGE, unit: CORTISOL_UNIT, gender: 'all', condition: '4pm-8pm' },
    ]);

    let cortisolFlagChanges = 0;
    const cortisolBulkOps = cortisolResults.flatMap((result: any) => {
      const updateSet: Record<string, any> = {};
      const nextFlag = resultsService.calculateFlag(String(result.value || ''), CORTISOL_MORNING_RANGE);

      if ((result.referenceRange || '').trim() !== CORTISOL_MORNING_RANGE) {
        updateSet.referenceRange = CORTISOL_MORNING_RANGE;
      }

      if ((result.menstrualPhase || '').trim() !== CORTISOL_DEFAULT_PHASE) {
        updateSet.menstrualPhase = CORTISOL_DEFAULT_PHASE;
      }

      if ((result.allReferenceRanges || '').trim() !== cortisolAllRanges) {
        updateSet.allReferenceRanges = cortisolAllRanges;
      }

      if (result.flag !== nextFlag) {
        updateSet.flag = nextFlag;
        cortisolFlagChanges += 1;
      }

      if (Object.keys(updateSet).length === 0) {
        return [];
      }

      return [
        {
          updateOne: {
            filter: { _id: result._id },
            update: { $set: updateSet },
          },
        },
      ];
    });

    if (cortisolBulkOps.length > 0) {
      await resultModel.bulkWrite(cortisolBulkOps);
    }

    console.log(
      `  [CORTISOL] Found ${cortisolResults.length}, updated ${cortisolBulkOps.length}, flags changed ${cortisolFlagChanges}`,
    );
    console.log('             Defaulted migrated cortisol results to 7am-10am for range selection.');

    console.log('\nDone.');
  } catch (error) {
    console.error('Failed to update existing GGT/CORTISOL results:', error);
    throw error;
  } finally {
    await app.close();
  }
}

updateExistingGgtAndCortisolResults()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
