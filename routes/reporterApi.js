const express = require('express');
const reporterController = require('../controllers/reporterController');

const router = express.Router();

router.get('/', reporterController.listArticles);
router.post('/', reporterController.createArticle);
router.patch('/:id', reporterController.saveDraft);
router.post('/:id/submit', reporterController.submitArticle);
router.delete('/:id', reporterController.deleteDraft);

module.exports = router;
