const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User } = require('../models/user');
const { getJwtSecret } = require('../middleware/authMiddleware');

const COOKIE_NAME = process.env.COOKIE_NAME || 'token';

const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, username: user.username, role: user.role },
    getJwtSecret(),
    { expiresIn: '8h' }
  );
};

const sendTokenCookie = (res, token) => {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 8 * 60 * 60 * 1000, 
  });
};

async function login(req, res, next) {
  try {
    const username = String(req.body.username || '').trim().toLowerCase();
    const password = String(req.body.password || '');

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
    sendTokenCookie(res, token);
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
  logout
};