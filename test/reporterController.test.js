const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const {
  parseListQuery,
  parseDraftFields,
  isValidImageUrl,
  workingVersion,
  saveDraft,
  submitArticle,
  showEditor,
} = require('../controllers/reporterController');

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

const reporter = { _id: new mongoose.Types.ObjectId(), username: 'reporter', role: 'reporter' };

test('the list shows all of the reporter\'s articles by default', () => {
  assert.deepEqual(parseListQuery({}).filters, { status: 'all', page: 1 });
});

test('accepts every status, rejects an unknown one', () => {
  for (const status of ['all', 'draft', 'pending', 'published', 'returned']) {
    assert.equal(parseListQuery({ status }).filters.status, status);
  }
  assert.ok(parseListQuery({ status: 'archived' }).error);
});

test('rejects a page that is not a whole positive number, and repeated parameters', () => {
  for (const page of ['0', '-1', '1.5', 'abc', '1001']) {
    assert.ok(parseListQuery({ page }).error, page);
  }
  assert.ok(parseListQuery({ status: ['draft', 'pending'] }).error);
});

test('draft fields: keeps only known string fields', () => {
  const { fields } = parseDraftFields({ title: 'T', content: 'Body', status: 'published', author: 'x' });
  assert.deepEqual(fields, { title: 'T', content: 'Body' });
});

test('draft fields: rejects non-text values and text over the limit', () => {
  assert.ok(parseDraftFields({ title: { $ne: '' } }).error);
  assert.ok(parseDraftFields({ title: 'a'.repeat(201) }).error);
  assert.ok(parseDraftFields({ summary: 'a'.repeat(501) }).error);
});

test('draft fields: an empty category means none yet, an unknown one is rejected', () => {
  assert.equal(parseDraftFields({ category: '' }).fields.category, null);
  assert.equal(parseDraftFields({ category: 'Sports' }).fields.category, 'Sports');
  assert.ok(parseDraftFields({ category: 'Gossip' }).error);
});

test('draft fields: an empty body is rejected', () => {
  assert.ok(parseDraftFields({}).error);
  assert.ok(parseDraftFields(undefined).error);
});

test('image must be empty or an http(s) address', () => {
  assert.ok(isValidImageUrl(''));
  assert.ok(isValidImageUrl('https://example.com/a.jpg'));
  assert.ok(!isValidImageUrl('javascript:alert(1)'));
  assert.ok(!isValidImageUrl('example.com/a.jpg'));
});

test('editing a published article with no draft starts from the live version', () => {
  const live = { title: 'Live', summary: 'S', image: '', category: 'News', content: 'Body', draft: null };
  assert.deepEqual(workingVersion(live), { title: 'Live', summary: 'S', image: '', category: 'News', content: 'Body' });

  const draft = { title: 'New', summary: 'S2', image: '', category: 'Sports', content: 'New body' };
  assert.deepEqual(workingVersion({ ...live, draft }), draft);
});

test('an invalid id gets 400 before any database call', async () => {
  for (const handler of [saveDraft, submitArticle]) {
    const res = mockRes();
    await handler({ params: { id: 'not-an-id' }, body: { title: 'x' }, user: reporter }, res);
    assert.equal(res.statusCode, 400);
  }
});

test('the edit page answers 404 for an invalid id', async () => {
  let error;
  await showEditor({ params: { id: 'not-an-id' }, user: reporter }, mockRes(), (err) => {
    error = err;
  });
  assert.equal(error.status, 404);
});

test('autosave with bad fields gets 400 before any database call', async () => {
  const res = mockRes();
  await saveDraft({ params: { id: new mongoose.Types.ObjectId().toString() }, body: { title: 5 }, user: reporter }, res);
  assert.equal(res.statusCode, 400);
});
