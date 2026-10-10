const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { getStats, parseRange, hourlySeries, summarizeUpdates } = require('../controllers/impactController');

const HOUR = 60 * 60 * 1000;
const at = (iso) => new Date(iso);

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

// a series of `hours` hourly points starting at `startIso`, every hour with `count` views
function flatSeries(startIso, hours, count) {
  const start = at(startIso).getTime();
  return Array.from({ length: hours }, (_, i) => ({ time: new Date(start + i * HOUR), count }));
}

test('range defaults to 7d and accepts 24h, 7d, 30d and all', () => {
  assert.equal(parseRange(undefined).range, '7d');
  for (const range of ['24h', '7d', '30d', 'all']) {
    assert.equal(parseRange(range).range, range);
  }
});

test('an unknown or repeated range is rejected', () => {
  assert.ok(parseRange('1y').error);
  assert.ok(parseRange('1h').error);
  assert.ok(parseRange('toString').error);
  assert.ok(parseRange(['7d', '24h']).error);
});

test('hourlySeries fills the hours nobody viewed with 0', () => {
  const buckets = [
    { hour: at('2026-10-10T10:00:00Z'), count: 5 },
    { hour: at('2026-10-10T12:00:00Z'), count: 2 },
  ];
  const series = hourlySeries(buckets, at('2026-10-10T10:00:00Z'), at('2026-10-10T13:00:00Z'));
  assert.deepEqual(series.map((p) => p.count), [5, 0, 2, 0]);
  assert.equal(series[3].time.toISOString(), '2026-10-10T13:00:00.000Z');
});

test('the first publish has no before and no change', () => {
  const firstPublish = at('2026-10-05T14:20:00Z');
  const series = flatSeries('2026-10-04T00:00:00Z', 24 * 6, 3);
  const [summary] = summarizeUpdates([firstPublish], series, at('2026-10-10T00:00:00Z'), firstPublish);
  assert.equal(summary.first, true);
  assert.equal(summary.before, null);
  assert.equal(summary.change, null);
  assert.equal(summary.after, 3);
});

test('an update compares the 24 hours before with the 24 hours after, in percent', () => {
  const firstPublish = at('2026-10-01T09:00:00Z');
  const update = at('2026-10-08T14:23:00Z');
  // 10 views/hour before the update's hour, 25 from it on
  const series = [
    ...flatSeries('2026-10-07T14:00:00Z', 24, 10),
    ...flatSeries('2026-10-08T14:00:00Z', 24, 25),
  ];
  const [summary] = summarizeUpdates([update], series, at('2026-10-10T00:00:00Z'), firstPublish);
  assert.equal(summary.first, false);
  assert.equal(summary.before, 10);
  assert.equal(summary.after, 25);
  assert.equal(summary.change, 150);
  assert.equal(summary.soFar, false);
});

test('a fall in views is a negative change', () => {
  const firstPublish = at('2026-10-01T09:00:00Z');
  const series = [
    ...flatSeries('2026-10-07T14:00:00Z', 24, 20),
    ...flatSeries('2026-10-08T14:00:00Z', 24, 15),
  ];
  const [summary] = summarizeUpdates([at('2026-10-08T14:00:00Z')], series, at('2026-10-10T00:00:00Z'), firstPublish);
  assert.equal(summary.change, -25);
});

test('an update less than 24 hours old is averaged over the hours so far', () => {
  const firstPublish = at('2026-10-01T09:00:00Z');
  const series = [
    ...flatSeries('2026-10-09T14:00:00Z', 24, 4),
    ...flatSeries('2026-10-10T14:00:00Z', 3, 8), // 14:00, 15:00, 16:00 so far
  ];
  const [summary] = summarizeUpdates([at('2026-10-10T14:10:00Z')], series, at('2026-10-10T16:30:00Z'), firstPublish);
  assert.equal(summary.soFar, true);
  assert.equal(summary.after, 8);
  assert.equal(summary.change, 100);
});

test('no views before an update gives no percentage instead of dividing by zero', () => {
  const firstPublish = at('2026-10-01T09:00:00Z');
  const series = [
    ...flatSeries('2026-10-07T14:00:00Z', 24, 0),
    ...flatSeries('2026-10-08T14:00:00Z', 24, 6),
  ];
  const [summary] = summarizeUpdates([at('2026-10-08T14:00:00Z')], series, at('2026-10-10T00:00:00Z'), firstPublish);
  assert.equal(summary.before, 0);
  assert.equal(summary.change, null);
});

test('getStats rejects a malformed id or range before touching the database', async () => {
  let res = mockRes();
  await getStats({ params: { id: 'not-an-id' }, query: {} }, res);
  assert.equal(res.statusCode, 400);

  res = mockRes();
  await getStats({ params: { id: new mongoose.Types.ObjectId().toString() }, query: { range: '1y' } }, res);
  assert.equal(res.statusCode, 400);
});
