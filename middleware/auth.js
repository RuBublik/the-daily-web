// Role checks for protected routes. The logged-in user (req.user) is set from the login cookie
// in app.js; routes only use requireAuth and requireRole.

const createError = require('http-errors');

// API calls get JSON, pages get the error page
function deny(req, res, next, status, message) {
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(status).json({ error: message });
  }
  next(createError(status, message));
}

function requireAuth(req, res, next) {
  if (!req.user) {
    return deny(req, res, next, 401, 'You need to log in');
  }
  next();
}

function requireRole(role) {
  return function (req, res, next) {
    if (!req.user) {
      return deny(req, res, next, 401, 'You need to log in');
    }
    if (req.user.role !== role) {
      return deny(req, res, next, 403, 'You do not have permission to do this');
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
