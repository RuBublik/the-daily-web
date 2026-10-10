const express = require('express');
const articleController = require('../controllers/articleController');
const impactController = require('../controllers/impactController');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', articleController.listArticles);
router.get('/:id', articleController.getArticle);
router.post('/:id/view', articleController.recordView);
// view statistics are for the editor only
router.get('/:id/stats', requireRole('editor'), impactController.getStats);

module.exports = router;
