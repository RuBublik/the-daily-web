const express = require('express');
const editorController = require('../controllers/editorController');

const router = express.Router();

router.get('/articles', editorController.listArticles);
router.patch('/articles/:id/draft', editorController.editDraft);
router.patch('/articles/:id/live', editorController.editLive);
router.delete('/articles/:id', editorController.deleteArticle);
router.post('/articles/:id/approve', editorController.approveArticle);
router.post('/articles/:id/return', editorController.returnArticle);

module.exports = router;
