const express = require('express');
const reporterController = require('../controllers/reporterController');

const router = express.Router();

// Reporter JSON API, mounted on /api/my-articles; app.js applies requireRole('reporter') to all of it.
// The controller only touches articles whose author is the logged-in reporter.
// GET /api/my-articles: the reporter's own articles (reporterController.listArticles).
router.get('/', reporterController.listArticles);
// POST /api/my-articles: creates a new article in 'draft' (reporterController.createArticle).
router.post('/', reporterController.createArticle);
// PATCH /api/my-articles/:id: the autosave, writes only the draft (reporterController.saveDraft).
router.patch('/:id', reporterController.saveDraft);
// POST /api/my-articles/:id/submit: sends the draft to the editor, status becomes 'pending' (reporterController.submitArticle).
router.post('/:id/submit', reporterController.submitArticle);
// DELETE /api/my-articles/:id: deletes a never-published draft (reporterController.deleteDraft).
router.delete('/:id', reporterController.deleteDraft);

module.exports = router;
