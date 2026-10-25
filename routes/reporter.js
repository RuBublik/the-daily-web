const express = require('express');
const reporterController = require('../controllers/reporterController');

const router = express.Router();

// Reporter pages, mounted on /reporter; app.js applies requireRole('reporter') to all of them.
// GET /reporter: the reporter's own workspace with their articles (reporterController.showDashboard).
router.get('/', reporterController.showDashboard);
// GET /reporter/articles/:id: the editor screen for one of the reporter's own articles (reporterController.showEditor).
router.get('/articles/:id', reporterController.showEditor);

module.exports = router;
