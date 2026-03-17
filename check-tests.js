const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb+srv://mmmnigeriaschool12_db_user:Iamhardy_7*@cluster0.abdi7yt.mongodb.net/carefaamlab?retryWrites=true&w=majority&appName=Cluster0&ssl=true&authSource=admin';

async function main() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected\n');

    const db = mongoose.connection.db;

    // Check panels
    const panels = await db.collection('test_panels').find({}).toArray();
    console.log(`📋 Found ${panels.length} panels:`);
    panels.forEach(p => {
      console.log(`   • ${p.code} - ${p.name}`);
      console.log(`     Tests: ${p.tests?.join(', ') || 'none'}`);
    });

    console.log('\n🧪 Checking test catalog...');
    const tests = await db.collection('test_catalog').find({ isActive: true }).toArray();
    console.log(`Found ${tests.length} active tests:`);
    tests.forEach(t => {
      console.log(`   • ${t.code} - ${t.name} (${t.category})`);
    });

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

main();
