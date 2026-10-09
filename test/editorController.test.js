const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { parseListQuery, toListRow } = require('../controllers/editorController');

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
