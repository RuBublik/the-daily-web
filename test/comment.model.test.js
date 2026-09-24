const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Comment = require('../models/Comment');

function makeComment(overrides = {}) {
  return new Comment({
    article: new mongoose.Types.ObjectId(),
    guestId: 'guest-1',
    authorName: 'Dana',
    text: 'Great article!',
    ...overrides,
  });
}

test('a fully-filled comment passes validation', () => {
  assert.strictEqual(makeComment().validateSync(), undefined);
});

test('rejects an empty text', () => {
  const err = makeComment({ text: '' }).validateSync();
  assert.ok(err && err.errors.text);
});

test('rejects text over the 1000-character limit', () => {
  const err = makeComment({ text: 'a'.repeat(1001) }).validateSync();
  assert.ok(err && err.errors.text);
});

test('accepts text right at the 1000-character limit', () => {
  const err = makeComment({ text: 'a'.repeat(1000) }).validateSync();
  assert.strictEqual(err, undefined);
});

test('rejects an empty authorName', () => {
  const err = makeComment({ authorName: '' }).validateSync();
  assert.ok(err && err.errors.authorName);
});

test('rejects authorName over the 60-character limit', () => {
  const err = makeComment({ authorName: 'a'.repeat(61) }).validateSync();
  assert.ok(err && err.errors.authorName);
});

test('rejects a comment missing guestId', () => {
  const err = makeComment({ guestId: undefined }).validateSync();
  assert.ok(err && err.errors.guestId);
});

test('rejects a comment missing article', () => {
  const err = makeComment({ article: undefined }).validateSync();
  assert.ok(err && err.errors.article);
});
