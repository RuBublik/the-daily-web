const jwt = require('jsonwebtoken');
const { User } = require('../models/user'); // ודא שהנתיב והשם (user.js / User.js) תואמים אצלך

const COOKIE_NAME = process.env.COOKIE_NAME || 'token';

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not defined in environment variables');
  }
  return secret;
}

function tokenFromRequest(req) {
  const authHeader = req.headers.authorization || req.get?.('authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.split(' ')[1];
  }
  if (req.cookies && req.cookies[COOKIE_NAME]) {
    return req.cookies[COOKIE_NAME];
  }
  return null;
}

async function resolveUser(req) {
  const token = tokenFromRequest(req);
  if (!token) return null;

  const decoded = jwt.verify(token, getJwtSecret());
  const userId = decoded.id || decoded.sub;
  if (!userId) return null;

  const user = await User.findById(userId);
  return user || null;
}

async function authenticateJwt(req, res, next) {
  try {
    const user = await resolveUser(req);
    if (!user) {
      return res.status(401).json({ message: 'אין הרשאת גישה - המשתמש שמשויך לטוקן לא נמצא' });
    }
    req.user = user;
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'טוקן לא תקף או פג תוקף' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ message: 'אין לך הרשאה לבצע פעולה זו' });
    }
    return next();
  };
}

module.exports = {
  getJwtSecret,
  tokenFromRequest,
  resolveUser,
  authenticateJwt,
  requireRole
};