import { GenderEnum } from '../../database/schemas/patient.schema';
import { ReferenceRangeItem } from '../../database/schemas/test-catalog.schema';

interface ResolveReferenceRangeOptions {
  age?: number;
  gender?: GenderEnum | 'M' | 'F' | 'O' | 'all';
  pregnancy?: boolean;
  condition?: string;
  simpleReferenceRange?: string;
  referenceRanges?: ReferenceRangeItem[];
  explicitReferenceRange?: string;
}

function normalizeGender(gender?: GenderEnum | 'M' | 'F' | 'O' | 'all'): 'M' | 'F' | 'all' {
  const normalizedGender = String(gender || '').toUpperCase();
  if (normalizedGender === GenderEnum.MALE) return 'M';
  if (normalizedGender === GenderEnum.FEMALE) return 'F';
  return 'all';
}

function ageMatches(range: ReferenceRangeItem, age?: number): boolean {
  if (age === undefined || age === null || Number.isNaN(age)) return true;
  const minMatch = range.ageMin === undefined || age >= range.ageMin;
  const maxMatch = range.ageMax === undefined || age <= range.ageMax;
  return minMatch && maxMatch;
}

function genderMatches(range: ReferenceRangeItem, gender: 'M' | 'F' | 'all'): boolean {
  if (!range.gender || range.gender === 'all') return true;
  if (gender === 'all') return false;
  return range.gender === gender;
}

function pickBestMatchingRange(
  ranges: ReferenceRangeItem[],
  age: number | undefined,
  gender: 'M' | 'F' | 'all',
  pregnancy?: boolean,
  condition?: string,
): ReferenceRangeItem | undefined {
  if (!ranges.length) return undefined;

  if (pregnancy && gender === 'F') {
    const pregnancyMatch = ranges.find((range) => range.pregnancy && ageMatches(range, age));
    if (pregnancyMatch) return pregnancyMatch;
  }

  if (condition) {
    const normalizedCondition = condition.trim().toLowerCase();
    const conditionMatch = ranges.find(
      (range) =>
        !!range.condition &&
        range.condition.trim().toLowerCase() === normalizedCondition &&
        ageMatches(range, age) &&
        genderMatches(range, gender),
    );
    if (conditionMatch) return conditionMatch;
  }

  const demographicMatch = ranges.find(
    (range) => !range.pregnancy && ageMatches(range, age) && genderMatches(range, gender),
  );
  if (demographicMatch) return demographicMatch;

  const allGenderMatch = ranges.find(
    (range) => !range.pregnancy && ageMatches(range, age) && (!range.gender || range.gender === 'all'),
  );
  if (allGenderMatch) return allGenderMatch;

  return ranges.find((range) => !range.pregnancy) || ranges[0];
}

export function resolveReferenceRange(options: ResolveReferenceRangeOptions): string | undefined {
  if (options.explicitReferenceRange) {
    return options.explicitReferenceRange;
  }

  const ranges = options.referenceRanges || [];
  const normalizedGender = normalizeGender(options.gender);

  if (ranges.length > 0) {
    const match = pickBestMatchingRange(
      ranges,
      options.age,
      normalizedGender,
      options.pregnancy,
      options.condition,
    );

    if (match?.range) {
      return match.range;
    }
  }

  return options.simpleReferenceRange;
}
