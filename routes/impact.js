const express = require('express');
const impactController = require('../controllers/impactController');

const router = express.Router();

// GET /impact: the Impact analytics page; app.js applies requireRole('editor') (impactController.showImpact).
router.get('/', impactController.showImpact);

module.exports = router;
