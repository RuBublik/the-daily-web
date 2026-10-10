const express = require('express');
const impactController = require('../controllers/impactController');

const router = express.Router();

router.get('/', impactController.showImpact);

module.exports = router;
