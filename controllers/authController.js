const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User } = require('../models/user');
const { getJwtSecret } = require('../middleware/authMiddleware');

const COOKIE_NAME = process.env.COOKIE_NAME || 'token';

// Login attempts, by username. A small in-memory map is enough here: one server process,
// and the point is just to slow down guessing against a known account (the single editor
// account especially), not to survive a restart.
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;
const loginAttempts = new Map();

function isLockedOut(username) {
  const entry = loginAttempts.get(username);
  return Boolean(entry && entry.lockedUntil && entry.lockedUntil > Date.now());
}

// a failed attempt outside the current window starts a fresh count instead of piling on
function recordFailedLogin(username) {
  const now = Date.now();
  const entry = loginAttempts.get(username);
  if (!entry || now - entry.windowStart > LOGIN_WINDOW_MS) {
    loginAttempts.set(username, { count: 1, windowStart: now, lockedUntil: null });
    return;
  }
  entry.count += 1;
  if (entry.count >= MAX_LOGIN_ATTEMPTS) {
    entry.lockedUntil = now + LOGIN_LOCKOUT_MS;
  }
}

function clearLoginAttempts(username) {
  loginAttempts.delete(username);
}

const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, username: user.username, role: user.role },
    getJwtSecret(),
    { expiresIn: '8h' }
  );
};

const sendTokenCookie = (req, res, token) => {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: req.secure,
    maxAge: 8 * 60 * 60 * 1000,
  });
};

async function login(req, res, next) {
  try {
    const username = String(req.body.username || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    const renderError = (message, status = 401) => {
      return res.status(status).render('auth/login', {
        title: 'Login - The Daily Web',
        error: message,
        username
      });
    };

    if (!username || !password) {
      return renderError('Username and password are required');
    }

    if (isLockedOut(username)) {
      return renderError('Too many failed login attempts. Try again in a few minutes.', 429);
    }

    const user = await User.findOne({ username }).select('+passwordHash');
    if (!user) {
      recordFailedLogin(username);
      return renderError('Invalid username or password');
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      recordFailedLogin(username);
      return renderError('Invalid username or password');
    }

    clearLoginAttempts(username);
    const token = generateToken(user);
    sendTokenCookie(req, res, token);
    // an editor lands in the editor area, everyone else on the home page
    return res.redirect(user.role === 'editor' ? '/editor' : '/');
  } catch (error) {
    next(error);
  }
}

async function currentUser(req, res, next) {
  try {
    return res.status(200).json(req.user);
  } catch (error) {
    next(error);
  }
}

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
  logout,
  clearLoginAttempts,
  MAX_LOGIN_ATTEMPTS,
};