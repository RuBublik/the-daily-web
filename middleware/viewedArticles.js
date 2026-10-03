// Not Express middleware itself: middleware/ is our folder for request helpers.
const mongoose = require('mongoose');

// keeps the cookie under the 4KB browser limit
const MAX_VIEWED_IDS = 100;
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

// the ids of the articles this guest opened, read from the "viewed" cookie
function getViewedIds(req) {
  const cookie = req.cookies && req.cookies.viewed;
  if (typeof cookie !== 'string' || !cookie) {
    return [];
  }
  // the browser controls the cookie, so drop anything that isn't a real id
  return cookie.split(',').filter((id) => mongoose.isValidObjectId(id));
}

// adds articleId to the front of the list and saves the cookie
function markViewed(req, res, articleId) {
  const id = String(articleId);
  const ids = getViewedIds(req).filter((existing) => existing !== id);
  ids.unshift(id);

  res.cookie('viewed', ids.slice(0, MAX_VIEWED_IDS).join(','), {
    maxAge: ONE_YEAR_MS,
    httpOnly: true,
    sameSite: 'lax',
  });
}

module.exports = { getViewedIds, markViewed, MAX_VIEWED_IDS };
