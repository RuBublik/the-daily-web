const mongoose = require('mongoose');
const Comment = require('../models/Comment');

const RATE_LIMIT_COUNT = 3;
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute

// mirrors the maxlength limits on models/Comment.js, checked here too so a
// direct API call that skips the form's maxlength gets a clean 400, not a
// Mongoose ValidationError reported as a 500
const MAX_AUTHOR_NAME_LENGTH = 60;
const MAX_TEXT_LENGTH = 1000;

function wouldExceedRateLimit(recentCount) {
  return recentCount >= RATE_LIMIT_COUNT;
}

// GET /api/articles/:articleId/comments
async function listComments(req, res) {
  const { articleId } = req.params;

  if (!mongoose.isValidObjectId(articleId)) {
    return res.status(400).json({ error: 'Invalid article id' });
  }

  try {
    const comments = await Comment.find({ article: articleId })
      .sort({ createdAt: -1 })
      .lean();
    res.json(comments);
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

module.exports = { listComments, addComment, wouldExceedRateLimit, RATE_LIMIT_COUNT };
