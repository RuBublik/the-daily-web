// Editor area: review, approve and publish articles. Every route here is behind requireRole('editor').

const mongoose = require('mongoose');
const createError = require('http-errors');
const Article = require('../models/Article');
const Comment = require('../models/Comment');
const ViewStat = require('../models/ViewStat');
const DailyViewStat = require('../models/DailyViewStat');

const PAGE_SIZE = 20;
const MAX_QUERY_LENGTH = 100;
const MAX_PAGE = 1000;
const STATUSES = Article.schema.path('status').enumValues;
const MAX_NOTE_LENGTH = 1000;
// the fields of a version (draft or live) that an editor can see and edit
const VERSION_FIELDS = ['title', 'summary', 'image', 'category', 'content'];
// what the public page needs, so a draft missing one of these cannot be published
const REQUIRED_TO_PUBLISH = ['title', 'summary', 'category', 'content'];

// remove special chars
// escapes regex characters so the search text is matched literally inside the MongoDB $regex
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// input validation. status defaults to pending: what is waiting for the editor
// checks status, q (title search) and page. returns { filters } or { error }.
// used by showDashboard and listArticles
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
// turns an article into one row of the dashboard list. also used by the reporter dashboard
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
    isUpdate: Article.isPublic(article) && Article.hasDraft(article),
  };
}

// one page (20) of all articles for the editor, newest change first, filtered by status and
// searched on both the live title and the draft title. returns { articles, hasMore }
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
// renders views/editor/index.ejs, by default the pending articles. bad query gives the 400 error page
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
// bad query gives 400 with { error }, otherwise { articles, page, hasMore }
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

// GET /editor/articles/:id, the review page: pending version, and the live one for an update
// renders views/editor/article.ejs for any article (the editor may see all). invalid id or missing gives 404
async function showArticle(req, res, next) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return next(createError(404, 'Article not found'));
  }

  try {
    const article = await Article.findById(id).lean();
    if (!article) {
      return next(createError(404, 'Article not found'));
    }
    res.render('editor/article', {
      title: 'Review article - The Daily Web',
      article,
      row: toListRow(article),
      // which of "Edit draft" / "Edit live" are available
      hasDraft: Article.hasDraft(article),
      isPublic: Article.isPublic(article),
      // approve and return only make sense while the article waits for the editor
      canReview: article.status === 'pending',
      categories: Article.schema.path('category').enumValues,
    });
  } catch (err) {
    next(err);
  }
}

// the draft fields a draft still needs before it can go public
// returns the names of the missing REQUIRED_TO_PUBLISH fields, empty when it is ready.
// used by approveArticle and editLive here, and by the reporter's submitArticle
function missingToPublish(draft) {
  return REQUIRED_TO_PUBLISH.filter((field) => !draft || !String(draft[field] || '').trim());
}

// status makes a double click (or two editors) approve only once; lastUpdated makes sure we're
// not about to publish a stale draft snapshot over one that was edited in the meantime (editDraft
// bumps lastUpdated on every save) — either mismatching means someone else moved first
// the filter approveArticle passes to findOneAndUpdate
function approvalFilter(id, article) {
  return { _id: id, status: 'pending', lastUpdated: article.lastUpdated };
}

// approving copies the draft over the live version, and records when it happened for the views chart
// the update that does pending to published: draft fields become the top-level fields, draft and
// editorNote are cleared, and now is pushed to publishHistory (the markers on the Impact chart)
function buildApprovalUpdate(article, now) {
  const set = {
    status: 'published',
    draft: null,
    editorNote: '',
    lastUpdated: now,
    // the first approval is the publish date, later ones are updates
    publishDate: article.publishDate || now,
  };
  for (const field of VERSION_FIELDS) {
    set[field] = article.draft[field] || '';
  }
  return { $set: set, $push: { publishHistory: now } };
}

// sends 400 for an id that is not a valid MongoDB ObjectId, before any database query
function invalidId(res) {
  return res.status(400).json({ error: 'Invalid article id' });
}

// sends 404 when no article has this id
function articleNotFound(res) {
  return res.status(404).json({ error: 'Article not found' });
}

// POST /api/editor/articles/:id/approve
// pending to published. checks the transition with Article.canTransition and that no required field
// is missing, then applies buildApprovalUpdate in one atomic update. 409 if it changed meanwhile
async function approveArticle(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return invalidId(res);
  }

  try {
    const article = await Article.findById(id).lean();
    if (!article) {
      return articleNotFound(res);
    }
    if (!Article.canTransition(article.status, 'published', req.user.role)) {
      return res.status(400).json({ error: `A ${article.status} article cannot be approved` });
    }
    const missing = missingToPublish(article.draft);
    if (missing.length > 0) {
      return res.status(400).json({ error: `Cannot publish, missing: ${missing.join(', ')}` });
    }

    const updated = await Article.findOneAndUpdate(
      approvalFilter(id, article),
      buildApprovalUpdate(article, new Date()),
      { returnDocument: 'after', runValidators: true }
    );
    if (!updated) {
      return res.status(409).json({ error: 'The article changed meanwhile, reload the page' });
    }

    console.log(`Article ${id} approved and published by editor ${req.user.username}`);
    res.json({ status: updated.status });
  } catch (err) {
    console.error('Failed to approve article:', err);
    res.status(500).json({ error: 'Could not approve the article' });
  }
}

// POST /api/editor/articles/:id/return, back to the reporter with a note on what to fix
// pending to returned. the note is required (up to 1000 chars) and is shown to the reporter,
// who fixes the draft and submits again (returned to pending)
async function returnArticle(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return invalidId(res);
  }

  const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
  if (!note) {
    return res.status(400).json({ error: 'Write a note explaining what needs fixing' });
  }
  if (note.length > MAX_NOTE_LENGTH) {
    return res.status(400).json({ error: `The note must be ${MAX_NOTE_LENGTH} characters or fewer` });
  }

  try {
    const article = await Article.findById(id).select('status').lean();
    if (!article) {
      return articleNotFound(res);
    }
    if (!Article.canTransition(article.status, 'returned', req.user.role)) {
      return res.status(400).json({ error: `A ${article.status} article cannot be returned` });
    }

    // the draft stays for the reporter to fix, and the live version (if any) stays public
    const updated = await Article.findOneAndUpdate(
      { _id: id, status: 'pending' },
      { $set: { status: 'returned', editorNote: note, lastUpdated: new Date() } },
      { returnDocument: 'after' }
    );
    if (!updated) {
      return res.status(409).json({ error: 'The article changed meanwhile, reload the page' });
    }

    console.log(`Article ${id} returned for revision by editor ${req.user.username}`);
    res.json({ status: updated.status });
  } catch (err) {
    console.error('Failed to return article:', err);
    res.status(500).json({ error: 'Could not return the article' });
  }
}

// only known version fields, and only strings, ever reach the database
// returns { fields } or { error }. used by editDraft and editLive; the schema validates the values
function parseVersionEdit(body) {
  const fields = {};
  for (const field of VERSION_FIELDS) {
    const value = body?.[field];
    if (value === undefined) {
      continue;
    }
    if (typeof value !== 'string') {
      return { error: `${field} must be text` };
    }
    fields[field] = value;
  }
  if (Object.keys(fields).length === 0) {
    return { error: 'Nothing to update' };
  }
  return { fields };
}

// shared catch for editDraft and editLive: schema validation errors become 400 with the message,
// anything else is logged and becomes 500, so a bad value never crashes the server
function handleEditError(err, res) {
  // a value the schema rejects, e.g. an unknown category or a title that is too long
  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: Object.values(err.errors)[0].message });
  }
  console.error('Failed to edit article:', err);
  res.status(500).json({ error: 'Could not save the changes' });
}

// PATCH /api/editor/articles/:id/draft, the version being worked on or waiting for approval.
// works in any status that has a draft, and does not change the status
// only the changed draft fields are set, so the public version is untouched. answers { draft }
async function editDraft(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return invalidId(res);
  }

  const { error, fields } = parseVersionEdit(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  try {
    const article = await Article.findById(id).select('draft').lean();
    if (!article) {
      return articleNotFound(res);
    }
    if (!Article.hasDraft(article)) {
      return res.status(400).json({ error: 'This article has no draft to edit' });
    }

    const set = { lastUpdated: new Date() };
    for (const [field, value] of Object.entries(fields)) {
      set[`draft.${field}`] = value;
    }
    // the draft condition fails if it was approved (and cleared) since we read the article
    const updated = await Article.findOneAndUpdate(
      { _id: id, draft: { $ne: null } },
      { $set: set },
      { returnDocument: 'after', runValidators: true }
    ).lean();
    if (!updated) {
      return res.status(409).json({ error: 'The article changed meanwhile, reload the page' });
    }

    res.json({ draft: updated.draft });
  } catch (err) {
    handleEditError(err, res);
  }
}

// PATCH /api/editor/articles/:id/live, the version readers see now.
// the editor is the one who approves, so the change is published right away
// only for an article that is already public, and it must keep all required fields.
// pushes the time to publishHistory like an approval. answers { live }
async function editLive(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return invalidId(res);
  }

  const { error, fields } = parseVersionEdit(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  try {
    const article = await Article.findById(id).lean();
    if (!article) {
      return articleNotFound(res);
    }
    if (!Article.isPublic(article)) {
      return res.status(400).json({ error: 'This article was never published, edit its draft instead' });
    }
    // a live article must keep everything its public page shows
    const missing = missingToPublish({ ...article, ...fields });
    if (missing.length > 0) {
      return res.status(400).json({ error: `A published article needs: ${missing.join(', ')}` });
    }

    const now = new Date();
    const updated = await Article.findOneAndUpdate(
      { _id: id },
      // recorded like an approval, so the views chart marks this update too
      { $set: { ...fields, lastUpdated: now }, $push: { publishHistory: now } },
      { returnDocument: 'after', runValidators: true }
    ).lean();
    if (!updated) {
      return articleNotFound(res);
    }

    console.log(`Published article ${id} edited live by editor ${req.user.username}`);
    const live = {};
    for (const field of VERSION_FIELDS) {
      live[field] = updated[field];
    }
    res.json({ live });
  } catch (err) {
    handleEditError(err, res);
  }
}

// DELETE /api/editor/articles/:id, with its comments and view statistics
// the editor can delete any article in any status. answers 204, or 404 if it does not exist
async function deleteArticle(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return invalidId(res);
  }

  try {
    const deleted = await Article.findByIdAndDelete(id);
    if (!deleted) {
      return articleNotFound(res);
    }
    // its comments and view history go with it; independent collections, so all at once
    await Promise.all([
      Comment.deleteMany({ article: id }),
      ViewStat.deleteMany({ article: id }),
      DailyViewStat.deleteMany({ article: id }),
    ]);

    console.log(`Article ${id} deleted by editor ${req.user.username}`);
    res.status(204).end();
  } catch (err) {
    console.error('Failed to delete article:', err);
    res.status(500).json({ error: 'Could not delete the article' });
  }
}

module.exports = {
  showDashboard,
  listArticles,
  showArticle,
  approveArticle,
  returnArticle,
  editDraft,
  editLive,
  deleteArticle,
  parseListQuery,
  toListRow,
  missingToPublish,
  buildApprovalUpdate,
  approvalFilter,
  parseVersionEdit,
  PAGE_SIZE,
};
