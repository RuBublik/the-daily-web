require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { User } = require('../models/user');

const MONGO_URI = process.env.MONGO_URI;

const rawUsers = [
  {
    name: 'אדמין המערכת',
    email: 'admin@example.com',
    password: 'AdminPassword123!',
    role: 'admin'
  },
  {
    name: 'ישראל ישראלי',
    email: 'user@example.com',
    password: 'UserPassword123!',
    role: 'user'
  },
  {
    name: 'נועה כהן',
    email: 'noa@example.com',
    password: 'UserPassword123!',
    role: 'user'
  }
];

async function seedUsers() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB for seeding...');

    await User.deleteMany({});
    console.log('Cleared existing users collection.');

    const rounds = Math.min(Math.max(Number(process.env.BCRYPT_ROUNDS || 10), 8), 14);

    const usersToInsert = await Promise.all(
      rawUsers.map(async (user) => {
        const passwordHash = await bcrypt.hash(user.password, rounds);
        return {
          name: user.name,
          email: user.email.toLowerCase(),
          passwordHash,
          role: user.role
        };
      })
    );

    const createdUsers = await User.insertMany(usersToInsert);
    console.log(`Successfully seeded ${createdUsers.length} users into the database!`);
    await mongoose.connection.close();
    console.log('MongoDB connection closed.');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding users:', error.message);
    await mongoose.connection.close();
    process.exit(1);
  }
}

seedUsers();