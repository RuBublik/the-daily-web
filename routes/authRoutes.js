const express = require('express');
const controller = require('../controllers/authController');
const { authenticateJwt } = require('../middleware/authMiddleware');

const router = express.Router();

// Login and logout, mounted on /auth and open to everyone.
// GET /auth/login: renders the login form directly, there is no logic to put in a controller.
router.get('/login', (req, res) => res.render('auth/login', {title: 'Login - The Daily Web', error: null }));
// POST /auth/login: checks username and password and sets the JWT cookie (authController.login).
router.post('/login', controller.login);
// GET /auth/me: the logged-in user as JSON; authenticateJwt answers 401 to guests (authController.currentUser).
router.get('/me', authenticateJwt, controller.currentUser);
// POST /auth/logout: clears the login cookie and redirects home (authController.logout).
router.post('/logout', controller.logout);

module.exports = router;