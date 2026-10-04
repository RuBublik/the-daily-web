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
  // copied from the user
  authorName: {
    type: String,
    required: true,
    trim: true,
  },
  content: {
    type: String,
    default: '',
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
    default: '',
  },
  publishDate: {
    type: Date,
    default: null,
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
  viewCount: {
    type: Number,
    default: 0,
    min: 0,
  },
});

// indexes creation
articleSchema.index({ status: 1, publishDate: -1 });
articleSchema.index({ status: 1, viewCount: -1 });

module.exports = mongoose.model('Article', articleSchema);
