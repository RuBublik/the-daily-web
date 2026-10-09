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

async function register(req, res, next) {
  try {
    const username = String(req.body.username || req.body.name || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const role = req.body.role === 'editor' ? 'editor' : 'reporter';

    const renderError = (message) => {
      return res.status(400).render('auth/register', {
        title: 'Register - The Daily Web',
        error: message,
        formData: { username }
      });
    };

    if (!username || password.length < 8) {
      return renderError('Username and a password of at least 8 characters are required');
    }
    
    if (role === 'editor') {
      if (!process.env.editor_SIGNUP_CODE) {
        return renderError('editor registration is currently disabled');
      }
      if (String(req.body.editorCode || '') !== process.env.editor_SIGNUP_CODE) {
        return renderError('The editor registration code is invalid');
      }
    }
    
    if (await User.exists({ username })) {
      return renderError('An account with this username already exists');
    }

    const rounds = Math.min(Math.max(Number(process.env.BCRYPT_ROUNDS || 10), 8), 14);
    const passwordHash = await bcrypt.hash(password, rounds);

    const user = await User.create({
      username,
      passwordHash,
      role
    });

    const token = generateToken(user);
    sendTokenCookie(res, token);

    return res.redirect('/');
  } catch (error) {
    next(error);
  }
}

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
    return res.redirect('/');
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
  register,
  login,
  currentUser,
  logout
};