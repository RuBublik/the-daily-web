const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const {
  generateData, isLocal, ARTICLE_COUNT, OLD_ARTICLE_COUNT, DAYS_OF_HISTORY,
} = require('../scripts/seed');
const Article = require('../models/Article');
const Comment = require('../models/Comment');
const ViewStat = require('../models/ViewStat');
const DailyViewStat = require('../models/DailyViewStat');
const categories = require('../config/categories');

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const reporters = ['yossi', 'noa', 'dan', 'maya'].map((username) => ({ _id: new mongoose.Types.ObjectId(), username }));
const now = new Date('2026-10-10T12:00:00Z');
const data = generateData(now, reporters);
const isOld = (a) => a.publishDate && a.publishDate.getTime() < now.getTime() - 365 * DAY;

test('creates 500+ articles in every status and every category', () => {
  assert.equal(data.articles.length, ARTICLE_COUNT + OLD_ARTICLE_COUNT);
  assert.ok(ARTICLE_COUNT >= 500);
  for (const status of ['draft', 'pending', 'published', 'returned']) {
    assert.ok(data.articles.some((a) => a.status === status), status);
  }
  for (const category of categories) {
    assert.ok(data.articles.some((a) => (a.category || a.draft.category) === category), category);
  }
});

test('every generated document passes its schema validation', () => {
  const check = (Model, docs) => docs.forEach((doc) => assert.equal(new Model(doc).validateSync(), undefined));
  check(Article, data.articles);
  check(Comment, data.comments);
  check(ViewStat, data.viewStats.slice(0, 2000));
  check(DailyViewStat, data.dailyViewStats.slice(0, 2000));
});

test('a never-approved article has no public fields; a published one starts its history at publishDate', () => {
  for (const article of data.articles) {
    if (article.publishDate) {
      assert.equal(article.publishHistory[0].getTime(), article.publishDate.getTime());
      assert.ok(article.lastUpdated >= article.publishHistory.at(-1), 'lastUpdated not before the last approval');
    } else {
      assert.ok(!article.title && !article.content, 'no public version');
      assert.ok(article.draft && article.draft.title, 'only a draft');
    }
  }
});

test('some published articles were updated, and some have an update waiting for approval', () => {
  assert.ok(data.articles.filter((a) => a.publishHistory && a.publishHistory.length > 1).length >= 30);
  assert.ok(data.articles.some((a) => a.publishDate && a.draft && a.status === 'pending'));
});

test('the same seed gives the same articles, even when run at another time', () => {
  const later = generateData(new Date(now.getTime() + 5 * HOUR), reporters);
  assert.deepEqual(
    later.articles.map((a) => [a.status, a.title || a.draft.title]),
    data.articles.map((a) => [a.status, a.title || a.draft.title])
  );
});

test('views and comments only exist after publishing, and viewCount is the daily total', () => {
  const byId = new Map(data.articles.map((a) => [String(a._id), a]));
  const totals = new Map();
  for (const bucket of data.dailyViewStats) {
    const article = byId.get(String(bucket.article));
    assert.ok(article.publishDate, 'views only for published articles');
    assert.ok(bucket.day.getTime() >= article.publishDate.getTime() - DAY);
    totals.set(String(bucket.article), (totals.get(String(bucket.article)) || 0) + bucket.count);
  }
  for (const article of data.articles.filter((a) => a.publishDate)) {
    assert.equal(article.viewCount, totals.get(String(article._id)) || 0);
  }
  for (const comment of data.comments) {
    assert.ok(comment.createdAt >= byId.get(String(comment.article)).publishDate);
  }
});

test('hourly buckets only cover the retention period, and add up to the daily totals there', () => {
  const keptFrom = ViewStat.startOfHour(now).getTime() - (ViewStat.RETENTION_DAYS - 1) * DAY;
  assert.ok(data.viewStats.every((b) => b.hour.getTime() >= keptFrom));
  // for an article published within the demo history, both views of it give the same total
  const recent = data.articles.find((a) => a.publishDate && !isOld(a) && a.viewCount > 0);
  const hourly = data.viewStats.filter((b) => b.article === recent._id).reduce((sum, b) => sum + b.count, 0);
  assert.equal(hourly, recent.viewCount);
  assert.ok(now.getTime() - recent.publishDate.getTime() <= DAYS_OF_HISTORY * DAY);
});

test('a few articles are 1 to 3 years old, updated, with daily history from their first day', () => {
  const old = data.articles.filter(isOld);
  assert.equal(old.length, OLD_ARTICLE_COUNT);
  for (const article of old) {
    assert.ok(article.publishDate.getTime() >= now.getTime() - 3 * 365 * DAY - DAY);
    assert.ok(article.publishHistory.length > 1);
    const days = data.dailyViewStats.filter((b) => b.article === article._id);
    assert.ok(days.length > 300, `${days.length} days of history`);
  }
});

test('only a local MongoDB counts as local, including a replica set of several hosts', () => {
  assert.equal(isLocal('mongodb://127.0.0.1:27017/the-daily-web'), true);
  assert.equal(isLocal('mongodb://localhost/the-daily-web'), true);
  assert.equal(isLocal('mongodb://localhost:27017,127.0.0.1:27018/db?replicaSet=rs0'), true);
  assert.equal(isLocal('mongodb://localhost:27017,db.example.com:27017/db?replicaSet=rs0'), false);
  assert.equal(isLocal('mongodb+srv://user:p%40ss@cluster0.example.mongodb.net/the-daily-web?appName=x'), false);
});
