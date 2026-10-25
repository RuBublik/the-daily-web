// Role checks for protected routes. The logged-in user (req.user) is set from the login cookie
// in app.js; routes only use requireAuth and requireRole.

const createError = require('http-errors');

// API calls get JSON, pages get the error page
// used by requireAuth and requireRole to refuse a request with 401 or 403
function deny(req, res, next, status, message) {
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(status).json({ error: message });
  }
  next(createError(status, message));
}

// lets the request through only when someone is logged in (req.user was set in app.js),
// otherwise refuses it with 401
function requireAuth(req, res, next) {
  if (!req.user) {
    return deny(req, res, next, 401, 'You need to log in');
  }
  next();
}

// returns a middleware that lets the request through only for a logged-in user with this role:
// 401 when nobody is logged in, 403 for the wrong role. used in app.js and routes, e.g.
// requireRole('editor') on /editor and /impact, requireRole('reporter') on /reporter.
// the role comes from the user record in the database, never from anything the browser sends
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
