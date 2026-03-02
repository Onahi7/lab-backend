const fs = require('fs');

// Read the seed file
const content = fs.readFileSync('./backend/src/database/seed-test-catalog.ts', 'utf8');

// Extract test objects (simplified parsing)
const testMatches = content.matchAll(/\{\s*code:\s*'([^']+)'[\s\S]*?(?=\},\s*\{|\},\s*\/\/|\},\s*\])/g);

const testsWithoutRanges = [];
const testsWithRanges = [];

for (const match of testMatches) {
  const testBlock = match[0];
  const code = match[1];
  
  const hasReferenceRange = testBlock.includes('referenceRange:') || testBlock.includes('referenceRanges:');
  
  if (!hasReferenceRange) {
    testsWithoutRanges.push(code);
  } else {
    testsWithRanges.push(code);
  }
}

console.log('\n=== TESTS WITHOUT REFERENCE RANGES ===');
console.log(`Total: ${testsWithoutRanges.length}`);
testsWithoutRanges.forEach(code => console.log(`  - ${code}`));

console.log('\n=== TESTS WITH REFERENCE RANGES ===');
console.log(`Total: ${testsWithRanges.length}`);
testsWithRanges.forEach(code => console.log(`  - ${code}`));

console.log('\n=== SUMMARY ===');
console.log(`Tests with ranges: ${testsWithRanges.length}`);
console.log(`Tests without ranges: ${testsWithoutRanges.length}`);
console.log(`Total tests: ${testsWithRanges.length + testsWithoutRanges.length}`);
