const mongoose = require('mongoose');
const categories = require('../config/categories');

const articleSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200,
  },
  summary: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500,
  },
  image: {
    type: String, // URL of the main image
    trim: true,
    default: '',
  },
  category: {
    type: String,
    required: true,
    enum: categories,
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  // copied from the user when the article is created, so the public feed
  // can show the author without a join on every request
  authorName: {
    type: String,
    required: true,
    trim: true,
  },
  content: {
    type: String,
    default: '', // the approved version the public sees
  },
  draftContent: {
    type: String,
    default: null, // version being worked on or waiting for approval, null when no edit is open
  },
  status: {
    type: String,
    enum: ['draft', 'pending', 'published', 'returned'],
    default: 'draft',
  },
  editorNote: {
    type: String,
    default: '', // the editor's note when the article is returned for revision
  },
  publishDate: {
    type: Date,
    default: null,
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
  // running total of views, lets the feed sort by popularity
  // without counting view records on every request
  viewCount: {
    type: Number,
    default: 0,
    min: 0,
  },
});

// speeds up the home feed sorted by publish date
articleSchema.index({ status: 1, publishDate: -1 });
// speeds up the home feed sorted by popularity
articleSchema.index({ status: 1, viewCount: -1 });

module.exports = mongoose.model('Article', articleSchema);
