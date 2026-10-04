const express = require('express');
const commentController = require('../controllers/commentController');

// mergeParams lets this router read :articleId from the URL it's mounted on
const router = express.Router({ mergeParams: true });

router.get('/', commentController.listComments);
router.post('/', commentController.addComment);

module.exports = router;
