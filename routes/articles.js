const express = require('express');
const articleController = require('../controllers/articleController');

const router = express.Router();

router.get('/', articleController.listArticles);
router.get('/:id', articleController.getArticle);
router.post('/:id/view', articleController.recordView);

module.exports = router;
