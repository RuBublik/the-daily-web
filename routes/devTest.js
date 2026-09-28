// Temporary route used only to develop/preview the comments widget before
// the real article page (another part of the project) exists.
// Safe to delete this whole file + its mount in app.js once that page is ready.

const express = require('express');
const router = express.Router();

const DEMO_ARTICLE_ID = '000000000000000000000001';

router.get('/comments-test', (req, res) => {
  res.render('dev-comments-test', { articleId: DEMO_ARTICLE_ID });
});

module.exports = router;
