// Reporter area: a reporter writes their own articles and sends them to the editor for approval.
// Every route here is behind requireRole('reporter'), and every query is limited to the
// logged-in reporter's articles (author: req.user._id), so another reporter's article is never reachable.

const mongoose = require('mongoose');
const createError = require('http-errors');
const Article = require('../models/Article');
const categories = require('../config/categories');
const { toListRow, missingToPublish } = require('./editorController');

const PAGE_SIZE = 20;
const MAX_PAGE = 1000;
const STATUSES = Article.schema.path('status').enumValues;
// the fields of a version (draft or live) that a reporter writes
const VERSION_FIELDS = ['title', 'summary', 'image', 'category', 'content'];
// the model's limits, checked here too so the reporter gets a clear message
const MAX_LENGTHS = { title: 200, summary: 500, image: 500, content: 50000 };
// a submitted (pending) article is locked until the editor publishes or returns it
const EDITABLE_STATUSES = ['draft', 'returned', 'published'];

// input validation. status defaults to all: the reporter sees every article they wrote
function parseListQuery(query) {
  const { status, page } = query;

  for (const value of [status, page]) {
    if (value !== undefined && typeof value !== 'string') {
      return { error: 'Invalid query parameter' };
    }
  }

  const filters = { status: 'all', page: 1 };

  if (status) {
    if (status !== 'all' && !STATUSES.includes(status)) {
      return { error: 'Unknown status' };
    }
    filters.status = status;
  }

  if (page !== undefined) {
    if (!/^\d+$/.test(page) || Number(page) < 1 || Number(page) > MAX_PAGE) {
      return { error: `page must be a whole number from 1 to ${MAX_PAGE}` };
    }
    filters.page = Number(page);
  }

  return { filters };
}

async function findMyArticles(user, filters) {
  const mongoFilter = { author: user._id };
  if (filters.status !== 'all') {
    mongoFilter.status = filters.status;
  }

  // one extra row tells whether another page exists
  const articles = await Article.find(mongoFilter)
    .sort({ lastUpdated: -1, _id: -1 })
    .select('title category draft.title draft.category authorName status publishDate lastUpdated')
    .skip((filters.page - 1) * PAGE_SIZE)
    .limit(PAGE_SIZE + 1)
    .lean();

  const hasMore = articles.length > PAGE_SIZE;
  if (hasMore) {
    articles.pop();
  }

  return { articles: articles.map(toListRow), hasMore };
}

// the reporter's own article, or null. someone else's article looks exactly like a missing one
function findOwnArticle(id, user) {
  return Article.findOne({ _id: id, author: user._id }).lean();
}

// the approved version readers see now
function liveVersion(article) {
  const live = {};
  for (const field of VERSION_FIELDS) {
    live[field] = article[field] || '';
  }
  return live;
}

// what the reporter edits: the open draft, or a copy of the live version to start a new one
function workingVersion(article) {
  return article.draft || liveVersion(article);
}

// only known fields, and only strings, ever reach the database.
// no format checks here: autosave sends half-typed text, which is checked on submit
function parseDraftFields(body) {
  const fields = {};
  for (const field of VERSION_FIELDS) {
    const value = body?.[field];
    if (value === undefined) {
      continue;
    }
    if (typeof value !== 'string') {
      return { error: `${field} must be text` };
    }
    if (value.length > MAX_LENGTHS[field]) {
      return { error: `${field} must be ${MAX_LENGTHS[field]} characters or fewer` };
    }
    fields[field] = value;
  }

  if (fields.category !== undefined) {
    // an empty select means "no category yet"
    if (fields.category === '') {
      fields.category = null;
    } else if (!categories.includes(fields.category)) {
      return { error: 'Unknown category' };
    }
  }

  if (Object.keys(fields).length === 0) {
    return { error: 'Nothing to save' };
  }
  return { fields };
}

// the image is optional, but when there is one it must be a web address
function isValidImageUrl(image) {
  return !image || /^https?:\/\/\S+$/i.test(image);
}

function invalidId(res) {
  return res.status(400).json({ error: 'Invalid article id' });
}

function articleNotFound(res) {
  return res.status(404).json({ error: 'Article not found' });
}

// GET /reporter, first page rendered on the server
async function showDashboard(req, res, next) {
  const { error, filters } = parseListQuery(req.query);
  if (error) {
    return next(createError(400, error));
  }

  try {
    const { articles, hasMore } = await findMyArticles(req.user, filters);
    res.render('reporter/index', {
      title: 'My articles - The Daily Web',
      articles,
      hasMore,
      filters,
      statuses: STATUSES,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/my-articles, for the status filter and "load more" without a page reload
async function listArticles(req, res) {
  const { error, filters } = parseListQuery(req.query);
  if (error) {
    return res.status(400).json({ error });
  }

  try {
    const { articles, hasMore } = await findMyArticles(req.user, filters);
    res.json({ articles, page: filters.page, hasMore });
  } catch (err) {
    console.error('Failed to list articles for the reporter:', err);
    res.status(500).json({ error: 'Could not load articles' });
  }
}

// POST /api/my-articles, a new empty article in "draft". the editor page then autosaves into it
async function createArticle(req, res) {
  try {
    const article = await Article.create({
      author: req.user._id,
      authorName: req.user.username,
      status: 'draft',
      draft: {},
    });
    console.log(`Article ${article._id} created by reporter ${req.user.username}`);
    res.status(201).json({ _id: article._id });
  } catch (err) {
    console.error('Failed to create article:', err);
    res.status(500).json({ error: 'Could not create the article' });
  }
}

// GET /reporter/articles/:id, the edit page, opened with the latest saved draft
async function showEditor(req, res, next) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return next(createError(404, 'Article not found'));
  }

  try {
    const article = await findOwnArticle(id, req.user);
    if (!article) {
      return next(createError(404, 'Article not found'));
    }
    res.render('reporter/article', {
      title: 'Edit article - The Daily Web',
      article,
      version: workingVersion(article),
      editable: EDITABLE_STATUSES.includes(article.status),
      isPublic: Article.isPublic(article),
      categories,
    });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/my-articles/:id, the autosave. writes only the draft, never the live version,
// so readers keep seeing the last approved version. the status does not change
async function saveDraft(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return invalidId(res);
  }

  const { error, fields } = parseDraftFields(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  try {
    const article = await findOwnArticle(id, req.user);
    if (!article) {
      return articleNotFound(res);
    }
    if (!EDITABLE_STATUSES.includes(article.status)) {
      return res.status(400).json({ error: 'This article is waiting for the editor and cannot be edited now' });
    }

    // the first save on a published article opens a draft from its live version
    const draft = { ...workingVersion(article), ...fields };
    // the status condition fails if the article was submitted meanwhile (e.g. from another tab)
    const updated = await Article.findOneAndUpdate(
      { _id: id, author: req.user._id, status: article.status },
      { $set: { draft, lastUpdated: new Date() } },
      { returnDocument: 'after', runValidators: true }
    ).lean();
    if (!updated) {
      return res.status(409).json({ error: 'The article changed meanwhile, reload the page' });
    }

    res.json({ lastUpdated: updated.lastUpdated });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: Object.values(err.errors)[0].message });
    }
    console.error('Failed to save draft:', err);
    res.status(500).json({ error: 'Could not save the draft' });
  }
}

// POST /api/my-articles/:id/submit, sends the draft to the editor: draft / returned / published -> pending
async function submitArticle(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return invalidId(res);
  }

  try {
    const article = await findOwnArticle(id, req.user);
    if (!article) {
      return articleNotFound(res);
    }
    if (!Article.canTransition(article.status, 'pending', req.user.role)) {
      return res.status(400).json({ error: `A ${article.status} article cannot be submitted` });
    }
    // a published article with no draft has nothing new to approve
    if (!Article.hasDraft(article)) {
      return res.status(400).json({ error: 'There are no changes to submit' });
    }
    const missing = missingToPublish(article.draft);
    if (missing.length > 0) {
      return res.status(400).json({ error: `Fill in before submitting: ${missing.join(', ')}` });
    }
    if (!isValidImageUrl(article.draft.image)) {
      return res.status(400).json({ error: 'The image must be a web address starting with http:// or https://' });
    }

    const updated = await Article.findOneAndUpdate(
      { _id: id, author: req.user._id, status: article.status },
      { $set: { status: 'pending', lastUpdated: new Date() } },
      { returnDocument: 'after' }
    );
    if (!updated) {
      return res.status(409).json({ error: 'The article changed meanwhile, reload the page' });
    }

    console.log(`Article ${id} submitted for approval by reporter ${req.user.username}`);
    res.json({ status: updated.status });
  } catch (err) {
    console.error('Failed to submit article:', err);
    res.status(500).json({ error: 'Could not submit the article' });
  }
}

module.exports = {
  showDashboard,
  listArticles,
  createArticle,
  showEditor,
  saveDraft,
  submitArticle,
  parseListQuery,
  parseDraftFields,
  isValidImageUrl,
  workingVersion,
  EDITABLE_STATUSES,
};
