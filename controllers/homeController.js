// Renders the home page on the server, so search engines get full HTML.
const categories = require('../config/categories');
const { parseFeedQuery, findPublishedArticles } = require('./articleController');
const { getViewedIds } = require('../middleware/viewedArticles');

async function showHome(req, res, next) {
  let parsed = parseFeedQuery(req.query);
  // a bad query string on the public page shows the default feed instead of an error page
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
