const mongoose = require('mongoose');
const uri = 'mongodb+srv://mmmnigeriaschool12_db_user:Iamhardy_7*@cluster0.abdi7yt.mongodb.net/carefaamlab?retryWrites=true&w=majority&appName=Cluster0&ssl=true&authSource=admin';

mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 }).then(async () => {
  const catCol = mongoose.connection.collection('test_catalog');
  const panelCol = mongoose.connection.collection('test_panels');

  // Check all HB tests in catalog
  console.log('=== test_catalog: HB tests ===');
  const hbTests = await catCol.find({ code: { $in: ['HBSAG', 'HBSAB', 'HBEAG', 'HBEAB', 'HBCAB'] } }).toArray();
  for (const t of hbTests) {
    console.log(`  ${t.code}: ${t.name} | price=${t.price} | active=${t.isActive} | category=${t.category}`);
  }

  // Check HEPB panel
  console.log('\n=== test_panels: HEPB ===');
  const panel = await panelCol.findOne({ code: 'HEPB' });
  if (panel) {
    console.log(`  ${panel.code}: ${panel.name} | price=${panel.price} | active=${panel.isActive}`);
    console.log(`  Tests (${panel.tests.length}):`);
    panel.tests.forEach(t => console.log(`    ${t.testCode}: ${t.testName}`));
  } else {
    console.log('  HEPB panel NOT FOUND');
  }

  await mongoose.disconnect();
  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
