const express = require('express');
const homeController = require('../controllers/homeController');
const articleController = require('../controllers/articleController');

const router = express.Router();

router.get('/', homeController.showHome);

/* GET a single published article. */
router.get('/article/:id', articleController.showArticle);

module.exports = router;
