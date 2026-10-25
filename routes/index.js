const express = require('express');
const homeController = require('../controllers/homeController');
const articleController = require('../controllers/articleController');

const router = express.Router();

// Public pages, rendered on the server with full content for SEO; open to everyone.
// GET /: the home feed with the first 20 published articles (homeController.showHome).
router.get('/', homeController.showHome);

/* GET a single published article. */
// GET /article/:id: open to everyone (articleController.showArticle).
router.get('/article/:id', articleController.showArticle);

module.exports = router;
