const createError = require('http-errors');
const mongoose = require('mongoose');
const Article = require('../models/Article');
const categories = require('../config/categories');
const { getViewedIds, markViewed } = require('../middleware/viewedArticles');

const PAGE_SIZE = 20;
const MAX_QUERY_LENGTH = 100;
const MAX_PAGE = 1000;

// remove special chars
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// input validation
function parseFeedQuery(query) {
  const { q, category, viewed, sort, page } = query;

  for (const value of [q, category, viewed, sort, page]) {
    if (value !== undefined && typeof value !== 'string') {
      return { error: 'Invalid query parameter' };
    }
  }

  const filters = { q: '', category: '', viewed: '', sort: 'date', page: 1 };

  if (q !== undefined) {
    filters.q = q.trim();
    if (filters.q.length > MAX_QUERY_LENGTH) {
      return { error: `Search text must be ${MAX_QUERY_LENGTH} characters or fewer` };
    }
  }

  if (category) {
    if (!categories.includes(category)) {
      return { error: 'Unknown category' };
    }
    filters.category = category;
  }

  if (viewed) {
    if (viewed !== 'viewed' && viewed !== 'unviewed') {
      return { error: 'viewed must be "viewed" or "unviewed"' };
    }
    filters.viewed = viewed;
  }

  if (sort) {
    if (sort !== 'date' && sort !== 'popular') {
      return { error: 'sort must be "date" or "popular"' };
    }
    filters.sort = sort;
  }

  if (page !== undefined) {
    // digits only
    if (!/^\d+$/.test(page) || Number(page) < 1 || Number(page) > MAX_PAGE) {
      return { error: `page must be a whole number from 1 to ${MAX_PAGE}` };
    }
    filters.page = Number(page);
  }

  return { filters };
}

async function findPublishedArticles(filters, viewedIds) {
  // an article is public once it has been approved (publishDate is set)
  const mongoFilter = { publishDate: { $ne: null } };

  if (filters.q) {
    mongoFilter.title = { $regex: escapeRegex(filters.q), $options: 'i' };
  }
  if (filters.category) {
    mongoFilter.category = filters.category;
  }
  if (filters.viewed === 'viewed') {
    mongoFilter._id = { $in: viewedIds };
  } else if (filters.viewed === 'unviewed') {
    mongoFilter._id = { $nin: viewedIds };
  }

  // _id as a tie-breaker keeps the order stable between pages
  const sortOrder = filters.sort === 'popular'
    ? { viewCount: -1, _id: -1 }
    : { publishDate: -1, _id: -1 };

  // fetching one extra row tells us whether another page exists without a second count query
  const articles = await Article.find(mongoFilter)
    .sort(sortOrder)
    // the list never needs the body, and draft / editorNote must never leave the server
    .select('title summary image category authorName publishDate viewCount')
    .skip((filters.page - 1) * PAGE_SIZE)
    .limit(PAGE_SIZE + 1)
    .lean();

  const hasMore = articles.length > PAGE_SIZE;
  if (hasMore) {
    articles.pop();
  }

  return { articles, hasMore };
}

// GET /api/articles
async function listArticles(req, res) {
  const { error, filters } = parseFeedQuery(req.query);
  if (error) {
    return res.status(400).json({ error });
  }

  try {
    const { articles, hasMore } = await findPublishedArticles(filters, getViewedIds(req));
    res.json({ articles, page: filters.page, hasMore });
  } catch (err) {
    console.error('Failed to list articles:', err);
    res.status(500).json({ error: 'Could not load articles' });
  }
}

// GET /api/articles/:id
async function getArticle(req, res) {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ error: 'Invalid article id' });
  }

  try {
    // returns only published
    const article = await Article.findOne({ _id: id, publishDate: { $ne: null } })
      .select('title summary image category authorName publishDate viewCount content')
      .lean();

    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }
    res.json(article);
  } catch (err) {
    console.error('Failed to load article:', err);
    res.status(500).json({ error: 'Could not load article' });
  }
}

// POST /api/articles/:id/view
// the analytics part of the project (view history over time) will extend this handler
async function recordView(req, res) {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ error: 'Invalid article id' });
  }

  try {
    // $inc is atomic, so many readers at once never lose a count
    const result = await Article.updateOne(
      { _id: id, status: 'published' },
      { $inc: { viewCount: 1 } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Article not found' });
    }
    res.status(204).end();
  } catch (err) {
    console.error('Failed to record view:', err);
    res.status(500).json({ error: 'Could not record view' });
  }
}

// GET /article/:id, the public article page rendered on the server
async function showArticle(req, res, next) {
  const { id } = req.params;

  // gives 404 if not exists
  if (!mongoose.isValidObjectId(id)) {
    return next(createError(404));
  }

  try {
    // drafts and pending articles must not be reachable by guessing the URL,
    // and only content (the approved version) is selected, never draft
    const article = await Article.findOne({ _id: id, publishDate: { $ne: null } })
      .select('title summary image category authorName publishDate content')
      .lean();

    if (!article) {
      return next(createError(404));
    }

    // remembers this article for the viewed / unviewed filter on the home page
    markViewed(req, res, id);

    // the body is stored as plain text; the view prints each paragraph escaped,
    // so article text can never inject HTML
    const paragraphs = article.content.split(/\n+/).filter((p) => p.trim());

    res.render('article', {
      title: article.title + ' | The Daily Web',
      description: article.summary,
      article,
      paragraphs,
    });
  } catch (err) {
    console.error('Failed to render article page:', err);
    next(err);
  }
}

module.exports = {
  parseFeedQuery,
  findPublishedArticles,
  listArticles,
  getArticle,
  recordView,
  showArticle,
  PAGE_SIZE,
};
