const express = require('express');
const homeController = require('../controllers/homeController');

const router = express.Router();

/* GET home page. */
router.get('/', homeController.showHome);

module.exports = router;
