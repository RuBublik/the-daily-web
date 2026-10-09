const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User } = require('../models/user');
const {getJwtSecret}=require('../middleware/authMiddleware')

const COOKIE_NAME = process.env.COOKIE_NAME || 'token';
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, email: user.email, role: user.role },
    getJwtSecret(),
    { expiresIn: '8h' }
  );
};

const sendTokenCookie = (res, token) => {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000, 
  });
};

async function register(req, res, next) {
  try {
    const name = String(req.body.username || req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const role = req.body.role === 'editor' ? 'editor' : 'reporter';

    const renderError = (message) => {
      return res.status(400).render('auth/register', {
        title: 'Register - The Daily Web',
        error: message,
        formData: { name, email }
      });
    };

    if (!name || !emailPattern.test(email) || password.length < 8) {
      return renderError('Username, a valid email, and a password of at least 8 characters are required');
    }
    
    if (role === 'editor') {
      if (!process.env.editor_SIGNUP_CODE) {
        return renderError('editor registration is currently disabled');
      }
      if (String(req.body.editorCode || '') !== process.env.editor_SIGNUP_CODE) {
        return renderError('The editor registration code is invalid');
      }
    }
    
    if (await User.exists({ email })) {
      return renderError('An account with this email already exists');
    }

    const rounds = Math.min(Math.max(Number(process.env.BCRYPT_ROUNDS || 10), 8), 14);
    const passwordHash = await bcrypt.hash(password, rounds);

    const user = await User.create({
      name,
      email,
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
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    const renderError = (message) => {
      return res.status(401).render('auth/login', {
        title: 'Login - The Daily Web',
        error: message,
        email 
      });
    };

    if (!email || !password) {
      return renderError('Email and password are required');
    }

    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user) {
      return renderError('Invalid email or password');
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return renderError('Invalid email or password');
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