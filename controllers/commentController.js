const mongoose = require('mongoose');
const Comment = require('../models/Comment');
const Article = require('../models/Article');

const RATE_LIMIT_COUNT = 3;
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute

// mirrors the maxlength limits on models/Comment.js, checked here too so a
// direct API call that skips the form's maxlength gets a clean 400, not a
// Mongoose ValidationError reported as a 500
const MAX_AUTHOR_NAME_LENGTH = 60;
const MAX_TEXT_LENGTH = 1000;
const MAX_SEARCH_LENGTH = 100;
// same page size and cap as articleController, for the same reason
const PAGE_SIZE = 20;
const MAX_PAGE = 1000;

function wouldExceedRateLimit(recentCount) {
  return recentCount >= RATE_LIMIT_COUNT;
}

// same approach as articleController's title search
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// GET /api/articles/:articleId/comments?q=&page=
async function listComments(req, res) {
  const { articleId } = req.params;
  const { q, page } = req.query || {};

  if (!mongoose.isValidObjectId(articleId)) {
    return res.status(400).json({ error: 'Invalid article id' });
  }
  if (q !== undefined && typeof q !== 'string') {
    return res.status(400).json({ error: 'Invalid query parameter' });
  }
  if (q !== undefined && q.length > MAX_SEARCH_LENGTH) {
    return res.status(400).json({ error: `Search text must be ${MAX_SEARCH_LENGTH} characters or fewer` });
  }
  let pageNum = 1;
  if (page !== undefined) {
    if (typeof page !== 'string' || !/^\d+$/.test(page)) {
      return res.status(400).json({ error: 'page must be a positive whole number' });
    }
    pageNum = Number(page);
    if (pageNum < 1 || pageNum > MAX_PAGE) {
      return res.status(400).json({ error: `page must be between 1 and ${MAX_PAGE}` });
    }
  }

  const filter = { article: articleId };
  if (q && q.trim()) {
    filter.text = { $regex: escapeRegex(q.trim()), $options: 'i' };
  }

  try {
    if (!(await Article.exists({ _id: articleId }))) {
      return res.status(404).json({ error: 'Article not found' });
    }

    // .lean() returns plain objects, bypassing the schema's toJSON transform below,
    // so guestId (the commenter's IP) has to be excluded here explicitly
    const comments = await Comment.find(filter)
      .select('-guestId')
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE + 1)
      .lean();

    const hasMore = comments.length > PAGE_SIZE;
    if (hasMore) {
      comments.pop();
    }
    res.json({ comments, page: pageNum, hasMore });
  } catch (err) {
    console.error('Failed to list comments:', err);
    res.status(500).json({ error: 'Could not load comments' });
  }
}

// POST /api/articles/:articleId/comments
async function addComment(req, res) {
  const { articleId } = req.params;
  const { authorName, text } = req.body || {};
  const guestId = req.ip; // server-determined, so a client can't pick a fresh id to dodge the rate limit

  if (!mongoose.isValidObjectId(articleId)) {
    return res.status(400).json({ error: 'Invalid article id' });
  }
  if (typeof authorName !== 'string' || !authorName.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }
  if (authorName.trim().length > MAX_AUTHOR_NAME_LENGTH) {
    return res.status(400).json({ error: `Name must be ${MAX_AUTHOR_NAME_LENGTH} characters or fewer` });
  }
  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Comment text is required' });
  }
  if (text.trim().length > MAX_TEXT_LENGTH) {
    return res.status(400).json({ error: `Comment text must be ${MAX_TEXT_LENGTH} characters or fewer` });
  }

  try {
    if (!(await Article.exists({ _id: articleId }))) {
      return res.status(404).json({ error: 'Article not found' });
    }

    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
    const recentCount = await Comment.countDocuments({
      guestId,
      createdAt: { $gte: windowStart },
    });

    if (wouldExceedRateLimit(recentCount)) {
      return res.status(429).json({
        error: `You can only post ${RATE_LIMIT_COUNT} comments per minute. Please wait a bit and try again.`,
      });
    }

    const comment = await Comment.create({
      article: articleId,
      guestId,
      authorName: authorName.trim(),
      text: text.trim(),
    });

    res.status(201).json(comment);
  } catch (err) {
    console.error('Failed to add comment:', err);
    res.status(500).json({ error: 'Could not save comment' });
  }
}

// PATCH /api/articles/:articleId/comments/:commentId — editor only, for moderation
async function updateComment(req, res) {
  const { articleId, commentId } = req.params;
  const { text } = req.body || {};

  if (!mongoose.isValidObjectId(articleId) || !mongoose.isValidObjectId(commentId)) {
    return res.status(400).json({ error: 'Invalid id' });
  }
  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Comment text is required' });
  }
  if (text.trim().length > MAX_TEXT_LENGTH) {
    return res.status(400).json({ error: `Comment text must be ${MAX_TEXT_LENGTH} characters or fewer` });
  }

  try {
    const comment = await Comment.findOneAndUpdate(
      { _id: commentId, article: articleId },
      { text: text.trim() },
      { new: true }
    );
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    res.json(comment);
  } catch (err) {
    console.error('Failed to update comment:', err);
    res.status(500).json({ error: 'Could not update comment' });
  }
}

// DELETE /api/articles/:articleId/comments/:commentId — editor only, for moderation
async function deleteComment(req, res) {
  const { articleId, commentId } = req.params;

  if (!mongoose.isValidObjectId(articleId) || !mongoose.isValidObjectId(commentId)) {
    return res.status(400).json({ error: 'Invalid id' });
  }

  try {
    const comment = await Comment.findOneAndDelete({ _id: commentId, article: articleId });
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    res.status(204).end();
  } catch (err) {
    console.error('Failed to delete comment:', err);
    res.status(500).json({ error: 'Could not delete comment' });
  }
}

module.exports = {
  listComments,
  addComment,
  updateComment,
  deleteComment,
  wouldExceedRateLimit,
  RATE_LIMIT_COUNT,
};
