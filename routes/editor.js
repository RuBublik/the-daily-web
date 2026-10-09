const express = require('express');
const editorController = require('../controllers/editorController');

const router = express.Router();

router.get('/', editorController.showDashboard);

module.exports = router;
