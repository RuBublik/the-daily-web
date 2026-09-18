const mongoose = require('mongoose');
const Comment = require('../models/Comment');

const RATE_LIMIT_COUNT = 3;
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute

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
  const { authorName, text, guestId } = req.body;

  if (!mongoose.isValidObjectId(articleId)) {
    return res.status(400).json({ error: 'Invalid article id' });
  }
  if (!guestId || typeof guestId !== 'string') {
    return res.status(400).json({ error: 'Missing guestId' });
  }
  if (!authorName || !authorName.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Comment text is required' });
  }

  try {
    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
    const recentCount = await Comment.countDocuments({
      guestId,
      createdAt: { $gte: windowStart },
    });

    if (recentCount >= RATE_LIMIT_COUNT) {
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

module.exports = { listComments, addComment };
