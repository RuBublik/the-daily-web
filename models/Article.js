const mongoose = require('mongoose');
const categories = require('../config/categories');

// an article is public once it has been approved at least once (publishDate is set).
// takes the article as a parameter, so it works on documents and on .lean() results alike
function isPublic(article) {
  return article.publishDate != null;
}

// an article has a draft while a version is being worked on or waits for approval
function hasDraft(article) {
  return article.draft != null;
}

// mongoose calls a `required` function with the document as `this`
function requiredOncePublic() {
  return isPublic(this);
}

// the working copy a reporter edits (autosaved) and an editor reviews
const draftSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, maxlength: [200, 'Title must be 200 characters or fewer'], default: '' },
    summary: { type: String, trim: true, maxlength: [500, 'Summary must be 500 characters or fewer'], default: '' },
    image: { type: String, trim: true, default: '' }, // URL of the main image
    category: { type: String, enum: { values: categories, message: 'Unknown category' } },
    content: { type: String, default: '' },
  },
  { _id: false }
);

const articleSchema = new mongoose.Schema({
  // title, summary, image, category and content are the approved version the public sees
  title: {
    type: String,
    required: requiredOncePublic,
    trim: true,
    maxlength: 200,
  },
  summary: {
    type: String,
    required: requiredOncePublic,
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
    required: requiredOncePublic,
    enum: categories,
  },
  content: {
    type: String,
    default: '',
  },
  // version being worked on or waiting for approval, null when no edit is open
  draft: {
    type: draftSchema,
    default: null,
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
  // state of the draft in the approval flow, not whether the public sees the article
  status: {
    type: String,
    enum: ['draft', 'pending', 'published', 'returned'],
    default: 'draft',
  },
  editorNote: {
    type: String,
    default: '',
  },
  // first approval, null until then
  publishDate: {
    type: Date,
    default: null,
  },
  // every editor approval, marks updates on the views chart
  publishHistory: {
    type: [Date],
    default: [],
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

// the  allowed status changes, by who may make them.
const TRANSITIONS = {
  reporter: {
    draft: ['pending'],
    returned: ['pending'],
    published: ['pending'], // an update to a published article goes to approval too
  },
  editor: {
    pending: ['published', 'returned'],
  },
};

articleSchema.statics.canTransition = function (from, to, role) {
  const allowed = (TRANSITIONS[role] || {})[from] || [];
  return allowed.includes(to);
};

articleSchema.statics.isPublic = isPublic;
articleSchema.statics.hasDraft = hasDraft;

// indexes creation
articleSchema.index({ publishDate: -1 });
articleSchema.index({ viewCount: -1 });
articleSchema.index({ status: 1, lastUpdated: -1 });
articleSchema.index({ author: 1, lastUpdated: -1 });

module.exports = mongoose.model('Article', articleSchema);
