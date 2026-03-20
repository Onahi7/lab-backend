const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb+srv://mmmnigeriaschool12_db_user:Iamhardy_7*@cluster0.abdi7yt.mongodb.net/carefaamlab?retryWrites=true&w=majority&appName=Cluster0&ssl=true&authSource=admin';

async function deleteDuplicateResults() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected successfully\n');

    const db = mongoose.connection.db;

    // Get all results
    const results = await db.collection('results').find({}).toArray();
    console.log(`Total results: ${results.length}`);

    // Group by orderId + testCode
    const groups = {};
    results.forEach(result => {
      const key = `${result.orderId}_${result.testCode}`;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(result);
    });

    // Find duplicates and keep only the oldest one
    let deletedCount = 0;
    for (const [key, tests] of Object.entries(groups)) {
      if (tests.length > 1) {
        // Sort by createdAt, keep the first (oldest)
        tests.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        const toKeep = tests[0];
        const toDelete = tests.slice(1);

        console.log(`${tests[0].testCode}: Keeping 1, deleting ${toDelete.length} duplicates`);

        // Delete the duplicates
        for (const dup of toDelete) {
          await db.collection('results').deleteOne({ _id: dup._id });
          deletedCount++;
        }
      }
    }

    console.log(`\n✅ Deleted ${deletedCount} duplicate results`);
    console.log(`Remaining results: ${results.length - deletedCount}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
  }
}

deleteDuplicateResults();
