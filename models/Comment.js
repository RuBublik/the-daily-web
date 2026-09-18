const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  article: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Article',
    required: true,
  },
  guestId: {
    type: String,
    required: true, // identifies the commenting device, used for rate limiting
  },
  authorName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 60,
  },
  text: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Comment', commentSchema);
