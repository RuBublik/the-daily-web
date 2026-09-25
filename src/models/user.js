const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, trim: true, lowercase: true, unique: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['user', 'admin'], default: 'user', required: true }
}, { 
  timestamps: true, 
  versionKey: false 
});

userSchema.set('toJSON', {
  virtuals: true,
  transform: (_document, value) => {
    delete value._id;
    delete value.passwordHash;
    return value;
  }
});

const User = mongoose.models.User || mongoose.model('User', userSchema);

module.exports = { User };