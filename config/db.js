const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    throw new Error('MONGO_URI is not set - check .env file');
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });

  console.log(`MongoDB connected (database: ${mongoose.connection.name})`);

  mongoose.connection.on('error', (err) => {
    console.error('MongoDB connection error:', err.message);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB disconnected - Mongoose will retry');
  });
}

module.exports = connectDB;
