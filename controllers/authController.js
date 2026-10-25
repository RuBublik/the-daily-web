const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User } = require('../models/user');
const { getJwtSecret } = require('../middleware/authMiddleware');

const COOKIE_NAME = process.env.COOKIE_NAME || 'token';

// creates a signed JWT with the user's id, username and role, valid for 8 hours.
// it is signed with the server's secret, so the browser cannot forge it or change its role
const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, username: user.username, role: user.role },
    getJwtSecret(),
    { expiresIn: '8h' }
  );
};

// stores the token in an httpOnly cookie (page JS cannot read it), sameSite strict so other sites
// cannot send it. the login lives in this signed cookie, not in server memory, so it survives a restart
const sendTokenCookie = (req, res, token) => {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: req.secure,
    maxAge: 8 * 60 * 60 * 1000,
  });
};

// POST /auth/login. finds the user by username and compares the password with the bcrypt hash.
// on success sets the token cookie and redirects by role (editor to /editor, reporter to /reporter).
// a wrong username and a wrong password get the same message, so usernames cannot be guessed
async function login(req, res, next) {
  try {
    const username = String(req.body.username || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    // shows the login form again with status 401 and the error, keeping the typed username
    const renderError = (message) => {
      return res.status(401).render('auth/login', {
        title: 'Login - The Daily Web',
        error: message,
        username 
      });
    };

    if (!username || !password) {
      return renderError('Username and password are required');
    }

    const user = await User.findOne({ username }).select('+passwordHash');
    if (!user) {
      return renderError('Invalid username or password');
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return renderError('Invalid username or password');
    }

    const token = generateToken(user);
    sendTokenCookie(req, res, token);
    // each role lands in its own area
    return res.redirect(user.role === 'editor' ? '/editor' : '/reporter');
  } catch (error) {
    next(error);
  }
}

// GET /auth/me, behind authenticateJwt. answers with the logged-in user (req.user) as JSON,
// which the middleware already loaded from the token cookie
async function currentUser(req, res, next) {
  try {
    return res.status(200).json(req.user);
  } catch (error) {
    next(error);
  }
}

// POST /auth/logout. deletes the token cookie, which ends the login, and goes back to the home page
async function logout(req, res, next) {
  try {
    res.clearCookie(COOKIE_NAME);
    return res.redirect('/');
  } catch (error) {
    next(error);
  }
}

module.exports = {
  login,
  currentUser,
  logout
};