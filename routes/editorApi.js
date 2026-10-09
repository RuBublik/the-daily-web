const express = require('express');
const editorController = require('../controllers/editorController');

const router = express.Router();

router.get('/articles', editorController.listArticles);

module.exports = router;
