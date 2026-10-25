const express = require('express');
const weatherController = require('../controllers/weatherController');

const router = express.Router();

// GET /api/weather: current weather for the sidebar widget, open to everyone (weatherController.getCurrentWeather).
router.get('/', weatherController.getCurrentWeather);

module.exports = router;
