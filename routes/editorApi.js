const express = require('express');
const editorController = require('../controllers/editorController');

const router = express.Router();

// Editor JSON API, mounted on /api/editor; app.js applies requireRole('editor') to all of it.
// GET /api/editor/articles: the article list with search and filters (editorController.listArticles).
router.get('/articles', editorController.listArticles);
// PATCH /api/editor/articles/:id/draft: edits the draft only, not public yet (editorController.editDraft).
router.patch('/articles/:id/draft', editorController.editDraft);
// PATCH /api/editor/articles/:id/live: edits the published version, public at once (editorController.editLive).
router.patch('/articles/:id/live', editorController.editLive);
// DELETE /api/editor/articles/:id: deletes an article (editorController.deleteArticle).
router.delete('/articles/:id', editorController.deleteArticle);
// POST /api/editor/articles/:id/approve: publishes the pending draft (editorController.approveArticle).
router.post('/articles/:id/approve', editorController.approveArticle);
// POST /api/editor/articles/:id/return: sends it back to the reporter with a note (editorController.returnArticle).
router.post('/articles/:id/return', editorController.returnArticle);

module.exports = router;
