const mongoose = require('mongoose');
const uri = 'mongodb+srv://mmmnigeriaschool12_db_user:Iamhardy_7*@cluster0.abdi7yt.mongodb.net/carefaamlab?retryWrites=true&w=majority&appName=Cluster0&ssl=true&authSource=admin';

mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 }).then(async () => {
  const catCol = mongoose.connection.collection('test_catalog');

  await catCol.findOneAndUpdate(
    { code: 'RF' },
    {
      $set: {
        code: 'RF',
        name: 'Rheumatoid Factor',
        category: 'immunoassay',
        sampleType: 'blood',
        price: 250,
        unit: 'IU/mL',
        turnaroundTime: 30,
        isActive: true,
        description: 'Rheumatoid factor — autoimmune screening for RA',
        referenceRange: '<14 IU/mL',
        referenceRanges: [
          { ageGroup: 'All ages', ageMin: 0, gender: 'all', range: '<14', unit: 'IU/mL' },
        ],
      },
    },
    { upsert: true, new: true },
  );

  const t = await catCol.findOne({ code: 'RF' });
  console.log('RF:', t.code, '| Price:', t.price, '| Range:', t.referenceRange);

  await mongoose.disconnect();
  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
