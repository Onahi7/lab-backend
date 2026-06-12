const mongoose = require('mongoose');
const uri = 'mongodb+srv://mmmnigeriaschool12_db_user:Iamhardy_7*@cluster0.abdi7yt.mongodb.net/carefaamlab?retryWrites=true&w=majority&appName=Cluster0&ssl=true&authSource=admin';

mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 }).then(async () => {
  const catCol = mongoose.connection.collection('test_catalog');

  await catCol.findOneAndUpdate(
    { code: 'IGE' },
    {
      $set: {
        code: 'IGE',
        name: 'Total IgE',
        category: 'immunoassay',
        sampleType: 'blood',
        price: 250,
        unit: 'IU/mL',
        turnaroundTime: 30,
        isActive: true,
        description: 'Total Immunoglobulin E — allergy screening',
        referenceRanges: [
          { ageGroup: '<1 year', ageMin: 0, ageMax: 1, gender: 'all', range: '0-15', unit: 'IU/mL' },
          { ageGroup: '1-5 years', ageMin: 1, ageMax: 5, gender: 'all', range: '0-60', unit: 'IU/mL' },
          { ageGroup: '6-9 years', ageMin: 6, ageMax: 9, gender: 'all', range: '0-90', unit: 'IU/mL' },
          { ageGroup: '10-15 years', ageMin: 10, ageMax: 15, gender: 'all', range: '0-200', unit: 'IU/mL' },
          { ageGroup: 'Adult', ageMin: 16, gender: 'all', range: '0-100', unit: 'IU/mL' },
        ],
      },
    },
    { upsert: true, new: true },
  );

  const t = await catCol.findOne({ code: 'IGE' });
  console.log('IGE:', t.code, '| Price:', t.price, '| Ranges:', t.referenceRanges.length);
  t.referenceRanges.forEach(r => console.log('  ' + r.ageGroup + ': ' + r.range + ' ' + r.unit));

  await mongoose.disconnect();
  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
