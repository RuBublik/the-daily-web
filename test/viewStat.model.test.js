const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const ViewStat = require('../models/ViewStat');

test('startOfHour drops minutes, seconds and milliseconds', () => {
  const hour = ViewStat.startOfHour(new Date('2026-10-10T14:37:12.345Z'));
  assert.equal(hour.toISOString(), '2026-10-10T14:00:00.000Z');
});

test('startOfHour keeps a moment that is already on the hour', () => {
  const hour = ViewStat.startOfHour(new Date('2026-10-10T14:00:00.000Z'));
  assert.equal(hour.toISOString(), '2026-10-10T14:00:00.000Z');
});

test('the last millisecond of an hour still belongs to that hour', () => {
  const hour = ViewStat.startOfHour(new Date('2026-10-10T14:59:59.999Z'));
  assert.equal(hour.toISOString(), '2026-10-10T14:00:00.000Z');
});

test('a bucket needs an article and an hour', () => {
  const err = new ViewStat({}).validateSync();
  assert.ok(err.errors.article);
  assert.ok(err.errors.hour);
});

test('a new bucket starts at zero and rejects a negative count', () => {
  const bucket = new ViewStat({ article: new mongoose.Types.ObjectId(), hour: new Date() });
  assert.equal(bucket.count, 0);
  bucket.count = -1;
  assert.ok(bucket.validateSync().errors.count);
});
