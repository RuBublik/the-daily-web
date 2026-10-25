const jwt = require('jsonwebtoken');
const { User } = require('../models/user');

const COOKIE_NAME = process.env.COOKIE_NAME || 'token';

// returns the secret used to sign and verify login tokens (JWT_SECRET in .env, never in the repo).
// throws when it is missing, instead of silently signing tokens with an empty secret
function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not defined in environment variables');
  }
  return secret;
}

// finds the login token (JWT) of a request: an "Authorization: Bearer <token>" header, or else
// the login cookie (COOKIE_NAME). returns null when the request has neither
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

// the logged-in user of a request, or null for a guest. verifies the token's signature and expiry
// (jwt.verify throws on a bad or expired token), then loads the user from the database by the id
// inside it. app.js calls it on every request to set req.user. because the token is in a cookie
// and checked against the secret, a login survives a server restart
async function resolveUser(req) {
  const token = tokenFromRequest(req);
  if (!token) return null;

  const decoded = jwt.verify(token, getJwtSecret());
  const userId = decoded.id || decoded.sub;
  if (!userId) return null;

  const user = await User.findById(userId).lean();
  return user || null;
}

// middleware version of resolveUser: sets req.user and continues, or answers 401 JSON when
// there is no valid token or the user no longer exists
async function authenticateJwt(req, res, next) {
  try {
    const user = await resolveUser(req);
    if (!user) {
      return res.status(401).json({ message: 'You do not have permission to perform this action' });
    }
    req.user = user;
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

module.exports = {
  getJwtSecret,
  tokenFromRequest,
  resolveUser,
  authenticateJwt
};