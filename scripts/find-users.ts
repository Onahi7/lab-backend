import mongoose from 'mongoose';

const MONGODB_URI =
  'mongodb+srv://mmmnigeriaschool12_db_user:Iamhardy_7*@cluster0.abdi7yt.mongodb.net/carefaamlab?retryWrites=true&w=majority&appName=Cluster0&ssl=true&authSource=admin';

async function run() {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db!;
  const users = await db.collection('users').find({}).toArray();

  console.log('All users:');
  users.forEach(u => console.log(JSON.stringify({ _id: u._id, username: u.username, email: u.email, full_name: u.full_name, fullName: u.fullName, name: u.name, roles: u.roles, role: u.role })));
  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
