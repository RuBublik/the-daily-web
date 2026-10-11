const express = require('express');
const commentController = require('../controllers/commentController');
const { requireRole } = require('../middleware/auth');

// mergeParams lets this router read :articleId from the URL it's mounted on
const router = express.Router({ mergeParams: true });

router.get('/', commentController.listComments);
router.post('/', commentController.addComment);
router.patch('/:commentId', requireRole('editor'), commentController.updateComment);
router.delete('/:commentId', requireRole('editor'), commentController.deleteComment);

module.exports = router;
