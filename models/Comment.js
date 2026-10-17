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

// speeds up the rate-limit count in commentController.addComment
commentSchema.index({ guestId: 1, createdAt: 1 });
// speeds up listComments, which lists by article newest-first
commentSchema.index({ article: 1, createdAt: -1 });

// guestId is the commenter's IP address (see commentController.addComment) — internal
// bookkeeping for the rate limit, never meant to leave the server. Same approach as
// models/user.js hiding passwordHash: strip it from every JSON response.
commentSchema.set('toJSON', {
  transform: (_document, value) => {
    delete value.guestId;
    return value;
  },
});

module.exports = mongoose.model('Comment', commentSchema);
