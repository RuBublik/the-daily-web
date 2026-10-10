const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { generateData, ARTICLE_COUNT, DAYS_OF_HISTORY } = require('../scripts/seed');
const categories = require('../config/categories');

const reporters = ['reporter', 'noa', 'dan', 'maya'].map((username) => ({ _id: new mongoose.Types.ObjectId(), username }));
const now = new Date('2026-10-10T12:00:00Z');
const data = generateData(now, reporters);

test('creates 500+ articles in every status and every category', () => {
  assert.equal(data.articles.length, ARTICLE_COUNT);
  assert.ok(ARTICLE_COUNT >= 500);
  for (const status of ['draft', 'pending', 'published', 'returned']) {
    assert.ok(data.articles.some((a) => a.status === status), status);
  }
  for (const category of categories) {
    assert.ok(data.articles.some((a) => (a.category || a.draft.category) === category), category);
  }
});

test('some published articles were updated, and some have an update waiting for approval', () => {
  assert.ok(data.articles.filter((a) => a.publishHistory && a.publishHistory.length > 1).length >= 30);
  assert.ok(data.articles.some((a) => a.publishDate && a.draft && a.status === 'pending'));
});

test('the same seed gives the same articles, even when run at another time', () => {
  const later = generateData(new Date(now.getTime() + 5 * 60 * 60 * 1000), reporters);
  assert.deepEqual(
    later.articles.map((a) => [a.status, a.title || a.draft.title]),
    data.articles.map((a) => [a.status, a.title || a.draft.title])
  );
});

test('views and comments only exist after publishing, and viewCount is their total', () => {
  const byId = new Map(data.articles.map((a) => [String(a._id), a]));
  const totals = new Map();
  for (const bucket of data.viewStats) {
    const article = byId.get(String(bucket.article));
    assert.ok(article.publishDate, 'views only for published articles');
    assert.ok(bucket.hour.getTime() >= article.publishDate.getTime() - 60 * 60 * 1000);
    totals.set(String(bucket.article), (totals.get(String(bucket.article)) || 0) + bucket.count);
  }
  for (const article of data.articles.filter((a) => a.publishDate)) {
    assert.equal(article.viewCount, totals.get(String(article._id)) || 0);
  }
  for (const comment of data.comments) {
    assert.ok(comment.createdAt >= byId.get(String(comment.article)).publishDate);
  }
});

test('view history stays within the configured number of days', () => {
  const oldest = Math.min(...data.viewStats.map((b) => b.hour.getTime()));
  assert.ok(now.getTime() - oldest <= DAYS_OF_HISTORY * 24 * 60 * 60 * 1000);
});
