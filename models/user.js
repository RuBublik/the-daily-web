const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, trim: true, lowercase: true, unique: true, maxlength: 100,match: [/^[a-zA-Z0-9_]+$/] },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['reporter', 'editor'], default: 'reporter', required: true }
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