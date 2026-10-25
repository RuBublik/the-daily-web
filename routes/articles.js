const express = require('express');
const articleController = require('../controllers/articleController');
const impactController = require('../controllers/impactController');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// Public JSON API for published articles (mounted on /api/articles, no login needed).
// GET /api/articles: the feed pages for infinite scroll, search, filter and sort (articleController.listArticles).
router.get('/', articleController.listArticles);
// GET /api/articles/:id: one published article as JSON (articleController.getArticle).
router.get('/:id', articleController.getArticle);
// POST /api/articles/:id/view: counts a view, sent by the article page on every load (articleController.recordView).
router.post('/:id/view', articleController.recordView);
// view statistics are for the editor only
// GET /api/articles/:id/stats: views over time for the Impact chart (impactController.getStats).
router.get('/:id/stats', requireRole('editor'), impactController.getStats);

module.exports = router;
