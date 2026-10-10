const express = require('express');
const controller = require('../controllers/authController');
const { authenticateJwt } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/login', (req, res) => res.render('auth/login', {title: 'Login - The Daily Web', error: null }));
router.post('/login', controller.login);
router.get('/me', authenticateJwt, controller.currentUser);
router.post('/logout', controller.logout);

module.exports = router;