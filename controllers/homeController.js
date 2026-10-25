// Renders the home page on the server, so search engines get full HTML.
const categories = require('../config/categories');
const { parseFeedQuery, findPublishedArticles } = require('./articleController');
const { getViewedIds } = require('../middleware/viewedArticles');

// GET / (routes/index.js), the public home feed. parseFeedQuery checks the query string, and on bad
// input the page falls back to the default feed instead of showing an error. renders views/index.ejs
// with the first 20 published articles already in the HTML; more pages come from /api/articles via Ajax
async function showHome(req, res, next) {
  let parsed = parseFeedQuery(req.query);
  // present default
  if (parsed.error) {
    parsed = parseFeedQuery({});
  }
  const filters = parsed.filters;

  try {
    const { articles, hasMore } = await findPublishedArticles(filters, getViewedIds(req));
    res.render('index', { title: 'The Daily Web', articles, hasMore, filters, categories });
  } catch (err) {
    console.error('Failed to render home page:', err);
    next(err);
  }
}

module.exports = { showHome };
