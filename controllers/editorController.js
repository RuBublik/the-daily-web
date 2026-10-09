// Editor area: review, approve and publish articles. Every route here is behind requireRole('editor').

const createError = require('http-errors');
const Article = require('../models/Article');

const PAGE_SIZE = 20;
const MAX_QUERY_LENGTH = 100;
const MAX_PAGE = 1000;
const STATUSES = Article.schema.path('status').enumValues;

// remove special chars
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// input validation. status defaults to pending: what is waiting for the editor
function parseListQuery(query) {
  const { status, q, page } = query;

  for (const value of [status, q, page]) {
    if (value !== undefined && typeof value !== 'string') {
      return { error: 'Invalid query parameter' };
    }
  }

  const filters = { status: 'pending', q: '', page: 1 };

  if (status) {
    if (status !== 'all' && !STATUSES.includes(status)) {
      return { error: 'Unknown status' };
    }
    filters.status = status;
  }

  if (q !== undefined) {
    filters.q = q.trim();
    if (filters.q.length > MAX_QUERY_LENGTH) {
      return { error: `Search text must be ${MAX_QUERY_LENGTH} characters or fewer` };
    }
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

// the editor sees the version being worked on: the draft's title when there is one
function toListRow(article) {
  const draft = article.draft || {};
  return {
    _id: article._id,
    title: draft.title || article.title || '(untitled)',
    category: draft.category || article.category || '',
    authorName: article.authorName,
    status: article.status,
    lastUpdated: article.lastUpdated,
    // a published article with an edit open: approving it replaces what the public sees
    isUpdate: article.publishDate != null && article.draft != null,
  };
}

async function findArticles(filters) {
  const mongoFilter = {};

  if (filters.status !== 'all') {
    mongoFilter.status = filters.status;
  }
  if (filters.q) {
    const titleMatch = { $regex: escapeRegex(filters.q), $options: 'i' };
    mongoFilter.$or = [{ title: titleMatch }, { 'draft.title': titleMatch }];
  }

  // fetching one extra row tells us whether another page exists without a second count query
  const PAGE_SIZE_PLUS_ONE = PAGE_SIZE + 1;
  const articles = await Article.find(mongoFilter)
    .sort({ lastUpdated: -1, _id: -1 })
    .select('title category draft.title draft.category authorName status publishDate lastUpdated')
    .skip((filters.page - 1) * PAGE_SIZE)
    .limit(PAGE_SIZE_PLUS_ONE)
    .lean();

  
  const hasMore = articles.length > PAGE_SIZE;
  if (hasMore) {
    articles.pop();
  }

  return { articles: articles.map(toListRow), hasMore };
}

// GET /editor, first page rendered on the server
async function showDashboard(req, res, next) {
  const { error, filters } = parseListQuery(req.query);
  if (error) {
    return next(createError(400, error));
  }

  try {
    const { articles, hasMore } = await findArticles(filters);
    res.render('editor/index', {
      title: 'Editor area - The Daily Web',
      articles,
      hasMore,
      filters,
      statuses: STATUSES,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/editor/articles, for filter, search and "load more" without a page reload
async function listArticles(req, res) {
  const { error, filters } = parseListQuery(req.query);
  if (error) {
    return res.status(400).json({ error });
  }

  try {
    const { articles, hasMore } = await findArticles(filters);
    res.json({ articles, page: filters.page, hasMore });
  } catch (err) {
    console.error('Failed to list articles for the editor:', err);
    res.status(500).json({ error: 'Could not load articles' });
  }
}

module.exports = { showDashboard, listArticles, parseListQuery, toListRow, PAGE_SIZE };
