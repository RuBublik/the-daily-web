const express = require('express');
const commentController = require('../controllers/commentController');
const { requireRole } = require('../middleware/auth');

// mergeParams lets this router read :articleId from the URL it's mounted on
const router = express.Router({ mergeParams: true });

// Comments of one article, mounted on /api/articles/:articleId/comments.
// GET: the article's comments, one page at a time, open to everyone (commentController.listComments).
router.get('/', commentController.listComments);
// POST: a guest adds a comment, limited to 3 per minute per device (commentController.addComment).
router.post('/', commentController.addComment);
// PATCH /:commentId and DELETE /:commentId: editor only, edit or remove a comment
// (commentController.updateComment, commentController.deleteComment).
router.patch('/:commentId', requireRole('editor'), commentController.updateComment);
router.delete('/:commentId', requireRole('editor'), commentController.deleteComment);

module.exports = router;
