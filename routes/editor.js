const express = require('express');
const editorController = require('../controllers/editorController');

const router = express.Router();

// Editor pages, mounted on /editor; app.js applies requireRole('editor') to all of them.
// GET /editor: the editor dashboard with every article (editorController.showDashboard).
router.get('/', editorController.showDashboard);
// GET /editor/articles/:id: one article for review and editing (editorController.showArticle).
router.get('/articles/:id', editorController.showArticle);

module.exports = router;
