const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Article = require('../models/Article');

function makeArticle(overrides = {}) {
  return new Article({
    title: 'City opens new park',
    summary: 'The new park opens to the public this weekend.',
    category: 'News',
    author: new mongoose.Types.ObjectId(),
    authorName: 'Dana',
    ...overrides,
  });
}

function makeNewDraft(draft = {}) {
  return new Article({
    author: new mongoose.Types.ObjectId(),
    authorName: 'Dana',
    draft: { title: 'Work in progress', ...draft },
  });
}

test('a fully-filled article passes validation', () => {
  assert.strictEqual(makeArticle().validateSync(), undefined);
});

test('a published article must have a title', () => {
  const err = makeArticle({ title: undefined, publishDate: new Date() }).validateSync();
  assert.ok(err && err.errors.title);
});

test('a new draft needs no public title, summary or category', () => {
  assert.strictEqual(makeNewDraft().validateSync(), undefined);
});

test('rejects an unknown category', () => {
  const err = makeArticle({ category: 'Gossip' }).validateSync();
  assert.ok(err && err.errors.category);
});

test('rejects an unknown category in the draft', () => {
  const err = makeNewDraft({ category: 'Gossip' }).validateSync();
  assert.ok(err && err.errors['draft.category']);
});

test('rejects an unknown status', () => {
  const err = makeArticle({ status: 'archived' }).validateSync();
  assert.ok(err && err.errors.status);
});

test('a new article starts as a draft with no views', () => {
  const article = makeArticle();
  assert.strictEqual(article.status, 'draft');
  assert.strictEqual(article.viewCount, 0);
});

test('a new article is not public and has never been approved', () => {
  const article = makeArticle();
  assert.strictEqual(article.publishDate, null);
  assert.deepStrictEqual([...article.publishHistory], []);
});

test('a new article has no open edit', () => {
  assert.strictEqual(makeArticle().draft, null);
});
