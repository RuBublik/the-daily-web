// Temporary stand-in for the real login (#26), so Part 4 can build protected routes now.
// Routes use only requireAuth and requireRole. When #26 merges, this file re-exports
// its middleware instead, and devUser is deleted.

const createError = require('http-errors');

// fixed ids, so articles created as the dev user still belong to them after a restart
const DEV_USERS = {
  reporter: { _id: '000000000000000000000001', username: 'dev-reporter', role: 'reporter' },
  editor: { _id: '000000000000000000000002', username: 'dev-editor', role: 'editor' },
};

// DEV_AS=reporter|editor in .env logs every request in as that user. Never in production.
function devUser(req, res, next) {
  const role = process.env.DEV_AS;
  if (process.env.NODE_ENV !== 'production' && DEV_USERS[role]) {
    req.user = DEV_USERS[role];
    res.locals.user = req.user;
  }
  next();
}

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

module.exports = { devUser, requireAuth, requireRole, DEV_USERS };
