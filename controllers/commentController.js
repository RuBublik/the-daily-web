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
// same page size as articleController
const PAGE_SIZE = 20;

// rate limit rule: a guest may post at most RATE_LIMIT_COUNT (3) comments per RATE_LIMIT_WINDOW_MS (1 minute).
// gets how many comments this guest already posted in the last minute and returns true when one more
// would go over the limit. kept as its own small function so the rule can be unit tested without a database
function wouldExceedRateLimit(recentCount) {
  return recentCount >= RATE_LIMIT_COUNT;
}

// same approach as articleController's title search
// puts a backslash before every regex special character, so the reader's search text is matched
// literally (searching for "a.b" or "(" must not be read as a regular expression)
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// GET /api/articles/:articleId/comments?q=&before=
// before is the id of the last comment the reader already has; the answer starts right after it.
// a cursor and not a page number: a comment posted meanwhile goes to the top of the list, and with
// skip() it would push the last comment of a page onto the next page, showing it twice
// validates the ids and the search text (400 on bad input), checks the article is published (404 if not),
// then answers JSON { comments, hasMore }: up to PAGE_SIZE comments, newest first, without guestId.
// it asks for one extra comment only to know whether a "Load more" button is needed
async function listComments(req, res) {
  const { articleId } = req.params;
  const { q, before } = req.query || {};

  if (!mongoose.isValidObjectId(articleId)) {
    return res.status(400).json({ error: 'Invalid article id' });
  }
  if (q !== undefined && typeof q !== 'string') {
    return res.status(400).json({ error: 'Invalid query parameter' });
  }
  if (q !== undefined && q.length > MAX_SEARCH_LENGTH) {
    return res.status(400).json({ error: `Search text must be ${MAX_SEARCH_LENGTH} characters or fewer` });
  }
  if (before !== undefined && (typeof before !== 'string' || !mongoose.isValidObjectId(before))) {
    return res.status(400).json({ error: 'before must be a comment id' });
  }

  const filter = { article: articleId };
  if (q && q.trim()) {
    filter.text = { $regex: escapeRegex(q.trim()), $options: 'i' };
  }

  try {
    // only a published article has public comments; same rule as the public article page
    if (!(await Article.exists({ _id: articleId, publishDate: { $ne: null } }))) {
      return res.status(404).json({ error: 'Article not found' });
    }

    if (before !== undefined) {
      const last = await Comment.findOne({ _id: before, article: articleId }).select('createdAt').lean();
      if (!last) {
        return res.status(404).json({ error: 'Comment not found, reload the page' });
      }
      // what comes after it in the sort below: older, or just as old with a smaller _id
      filter.$or = [
        { createdAt: { $lt: last.createdAt } },
        { createdAt: last.createdAt, _id: { $lt: last._id } },
      ];
    }

    // .lean() returns plain objects, bypassing the schema's toJSON transform below,
    // so guestId (the commenter's IP) has to be excluded here explicitly
    const comments = await Comment.find(filter)
      .select('-guestId')
      .sort({ createdAt: -1, _id: -1 })
      .limit(PAGE_SIZE + 1)
      .lean();

    const hasMore = comments.length > PAGE_SIZE;
    if (hasMore) {
      comments.pop();
    }
    res.json({ comments, hasMore });
  } catch (err) {
    console.error('Failed to list comments:', err);
    res.status(500).json({ error: 'Could not load comments' });
  }
}

// POST /api/articles/:articleId/comments
// a guest posts a comment from the article page (public/js/article.js, via Ajax). validates the name and text,
// checks the article is published, then counts this guest's comments from the last minute: a 4th one
// is refused with 429 and a clear message. on success answers 201 with the new comment, so the page
// can add it to the list right away without reloading the whole list
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
    // only a published article has public comments; same rule as the public article page
    if (!(await Article.exists({ _id: articleId, publishDate: { $ne: null } }))) {
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
// the route allows it only for the editor (requireRole('editor') in routes/comments.js).
// validates the ids and the new text, replaces the text of a comment that belongs to this article,
// and answers with the updated comment, or 404 when there is no such comment
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
// the route allows it only for the editor (requireRole('editor') in routes/comments.js).
// deletes the comment only if it belongs to this article; answers 204 (no body) or 404 when not found
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
