const mongoose = require('mongoose');

const MAX_VIEWED_IDS = 100;
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

// the ids of the articles this guest opened, read from the "viewed" cookie
// invalid ids are dropped, since the cookie can be edited by the browser. returns [] when there is none.
// used by the home page and the feed API for the viewed / not viewed filter
function getViewedIds(req) {
  const cookie = req.cookies && req.cookies.viewed;
  if (typeof cookie !== 'string' || !cookie) {
    return [];
  }
  return cookie.split(',').filter((id) => mongoose.isValidObjectId(id));
}

// adds articleId to the front of the list and saves the cookie
// (removing it first if it was already there), keeping only the last MAX_VIEWED_IDS (100) ids.
// called when the article page is rendered. httpOnly, so page scripts cannot read or change it
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
