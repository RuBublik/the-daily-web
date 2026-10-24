const express = require('express');
const reporterController = require('../controllers/reporterController');

const router = express.Router();

router.get('/', reporterController.showDashboard);
router.get('/articles/:id', reporterController.showEditor);

module.exports = router;
