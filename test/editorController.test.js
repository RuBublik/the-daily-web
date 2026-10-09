const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const {
  parseListQuery,
  toListRow,
  missingToPublish,
  buildApprovalUpdate,
  parseDraftEdit,
  approveArticle,
  returnArticle,
  editArticle,
  deleteArticle,
} = require('../controllers/editorController');

function mockRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

const editor = { username: 'dev-editor', role: 'editor' };
const validId = () => new mongoose.Types.ObjectId().toString();
const fullDraft = { title: 'New title', summary: 'New summary', image: '', category: 'Sports', content: 'New body' };

test('the list shows pending articles by default', () => {
  assert.deepEqual(parseListQuery({}).filters, { status: 'pending', q: '', page: 1 });
});

test('accepts every status and "all"', () => {
  for (const status of ['all', 'draft', 'pending', 'published', 'returned']) {
    assert.equal(parseListQuery({ status }).filters.status, status);
  }
});

test('rejects an unknown status', () => {
  assert.ok(parseListQuery({ status: 'archived' }).error);
});

test('rejects a repeated query parameter (sent as an array)', () => {
  assert.ok(parseListQuery({ status: ['pending', 'draft'] }).error);
});

test('rejects a search over 100 characters', () => {
  assert.ok(parseListQuery({ q: 'a'.repeat(101) }).error);
});

test('rejects a page that is not a whole positive number', () => {
  for (const page of ['0', '-1', '1.5', 'abc', '1001']) {
    assert.ok(parseListQuery({ page }).error, page);
  }
});

test('a row shows the draft title when an edit is open', () => {
  const row = toListRow({
    _id: new mongoose.Types.ObjectId(),
    title: 'Live title',
    category: 'News',
    draft: { title: 'New title', category: 'Sports' },
    authorName: 'Dana',
    status: 'pending',
    publishDate: new Date(),
    lastUpdated: new Date(),
  });
  assert.equal(row.title, 'New title');
  assert.equal(row.category, 'Sports');
  assert.equal(row.isUpdate, true);
});

test('a never-published draft is not marked as an update', () => {
  const row = toListRow({
    _id: new mongoose.Types.ObjectId(),
    draft: { title: 'First draft' },
    authorName: 'Dana',
    status: 'draft',
    publishDate: null,
    lastUpdated: new Date(),
  });
  assert.equal(row.title, 'First draft');
  assert.equal(row.isUpdate, false);
});

test('a published article with no open edit shows its public title', () => {
  const row = toListRow({
    _id: new mongoose.Types.ObjectId(),
    title: 'Live title',
    category: 'News',
    draft: null,
    authorName: 'Dana',
    status: 'published',
    publishDate: new Date(),
    lastUpdated: new Date(),
  });
  assert.equal(row.title, 'Live title');
  assert.equal(row.isUpdate, false);
});

test('a draft with every public field can be published', () => {
  assert.deepEqual(missingToPublish(fullDraft), []);
});

test('lists the fields a draft still misses before publishing', () => {
  assert.deepEqual(missingToPublish({ ...fullDraft, summary: '   ', content: '' }), ['summary', 'content']);
  assert.deepEqual(missingToPublish(null), ['title', 'summary', 'category', 'content']);
});

test('the first approval publishes the draft and sets the publish date', () => {
  const now = new Date('2026-10-10T14:00:00Z');
  const { $set, $push } = buildApprovalUpdate({ draft: fullDraft, publishDate: null }, now);
  assert.equal($set.title, 'New title');
  assert.equal($set.content, 'New body');
  assert.equal($set.status, 'published');
  assert.equal($set.draft, null);
  assert.equal($set.editorNote, '');
  assert.equal($set.publishDate, now);
  assert.equal($push.publishHistory, now);
});

test('approving an update keeps the first publish date and records the update', () => {
  const firstPublish = new Date('2026-10-01T09:00:00Z');
  const now = new Date('2026-10-10T14:00:00Z');
  const { $set, $push } = buildApprovalUpdate({ draft: fullDraft, publishDate: firstPublish }, now);
  assert.equal($set.publishDate, firstPublish);
  assert.equal($push.publishHistory, now);
});

test('an edit keeps only known draft fields', () => {
  const { set } = parseDraftEdit({ title: 'T', status: 'published', author: 'x' });
  assert.deepEqual(set, { 'draft.title': 'T' });
});

test('an edit rejects a field that is not text (e.g. a Mongo operator)', () => {
  assert.ok(parseDraftEdit({ title: { $gt: '' } }).error);
});

test('an edit with nothing to change is rejected', () => {
  assert.ok(parseDraftEdit({}).error);
  assert.ok(parseDraftEdit(undefined).error);
});

test('every action rejects a malformed id with 400, no database needed', async () => {
  for (const handler of [approveArticle, returnArticle, editArticle, deleteArticle]) {
    const res = mockRes();
    await handler({ params: { id: 'not-an-id' }, body: {}, user: editor }, res);
    assert.equal(res.statusCode, 400, handler.name);
  }
});

test('returning without a note is rejected before touching the database', async () => {
  for (const body of [{}, { note: '   ' }, { note: 42 }]) {
    const res = mockRes();
    await returnArticle({ params: { id: validId() }, body, user: editor }, res);
    assert.equal(res.statusCode, 400);
  }
});

test('returning with a note over 1000 characters is rejected', async () => {
  const res = mockRes();
  await returnArticle({ params: { id: validId() }, body: { note: 'a'.repeat(1001) }, user: editor }, res);
  assert.equal(res.statusCode, 400);
});
