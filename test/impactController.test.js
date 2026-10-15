const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const {
  getStats, parseRange, chooseStep, hourlySeries, dailySeries, monthlySeries, summarizeUpdates, summarizeDailyUpdates,
} = require('../controllers/impactController');

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
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

test('an update soon after the first publish compares only the hours since it was published', () => {
  const firstPublish = at('2026-10-08T10:15:00Z');
  // 0 before the publish, then the same 10 views/hour before and after the update at 14:00
  const series = [
    ...flatSeries('2026-10-07T14:00:00Z', 20, 0),
    ...flatSeries('2026-10-08T10:00:00Z', 28, 10),
  ];
  const [summary] = summarizeUpdates([at('2026-10-08T14:00:00Z')], series, at('2026-10-10T00:00:00Z'), firstPublish);
  assert.equal(summary.before, 10);
  assert.equal(summary.change, 0);
});

test('the current hour, still filling up, is not part of the after average', () => {
  const firstPublish = at('2026-10-01T09:00:00Z');
  const series = [
    ...flatSeries('2026-10-09T14:00:00Z', 24, 4),
    ...flatSeries('2026-10-10T14:00:00Z', 2, 8), // 14:00 and 15:00 full hours
    { time: at('2026-10-10T16:00:00Z'), count: 1 }, // 16:00, five minutes in
  ];
  const [summary] = summarizeUpdates([at('2026-10-10T14:10:00Z')], series, at('2026-10-10T16:05:00Z'), firstPublish);
  assert.equal(summary.after, 8);
  assert.equal(summary.soFar, true);
});

test('an approval in the current hour still gets an after value', () => {
  const firstPublish = at('2026-10-01T09:00:00Z');
  const series = [
    ...flatSeries('2026-10-09T16:00:00Z', 24, 4),
    { time: at('2026-10-10T16:00:00Z'), count: 3 },
  ];
  const [summary] = summarizeUpdates([at('2026-10-10T16:10:00Z')], series, at('2026-10-10T16:40:00Z'), firstPublish);
  assert.equal(summary.after, 3);
  assert.equal(summary.soFar, true);
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

test('the chart step is hours up to 31 days, days up to 2 years, months beyond', () => {
  const now = at('2026-10-15T12:00:00Z');
  const before = (ms) => new Date(now.getTime() - ms);
  assert.equal(chooseStep(before(23 * HOUR), now), 'hour');
  assert.equal(chooseStep(before(31 * DAY), now), 'hour');
  assert.equal(chooseStep(before(32 * DAY), now), 'day');
  assert.equal(chooseStep(before(2 * 365 * DAY), now), 'day');
  assert.equal(chooseStep(before(2 * 365 * DAY + DAY), now), 'month');
});

test('dailySeries fills the days nobody viewed with 0', () => {
  const buckets = [
    { day: at('2026-10-01T00:00:00Z'), count: 40 },
    { day: at('2026-10-03T00:00:00Z'), count: 7 },
  ];
  const series = dailySeries(buckets, at('2026-10-01T00:00:00Z'), at('2026-10-04T00:00:00Z'));
  assert.deepEqual(series.map((p) => p.count), [40, 0, 7, 0]);
});

test('monthlySeries adds the days of each month up', () => {
  const days = dailySeries(
    [
      { day: at('2026-01-30T00:00:00Z'), count: 5 },
      { day: at('2026-01-31T00:00:00Z'), count: 5 },
      { day: at('2026-02-01T00:00:00Z'), count: 3 },
      { day: at('2026-03-15T00:00:00Z'), count: 2 },
    ],
    at('2026-01-30T00:00:00Z'),
    at('2026-03-15T00:00:00Z')
  );
  const months = monthlySeries(days);
  assert.deepEqual(
    months.map((p) => [p.time.toISOString(), p.count]),
    [['2026-01-01T00:00:00.000Z', 10], ['2026-02-01T00:00:00.000Z', 3], ['2026-03-01T00:00:00.000Z', 2]]
  );
});

test('an approval older than the hourly history compares the day before with the day after', () => {
  const firstPublish = at('2025-01-01T09:00:00Z');
  const daily = dailySeries(
    [
      { day: at('2025-06-09T00:00:00Z'), count: 240 }, // 10 per hour
      { day: at('2025-06-10T00:00:00Z'), count: 999 }, // the approval's own day is not used
      { day: at('2025-06-11T00:00:00Z'), count: 360 }, // 15 per hour
    ],
    at('2025-06-08T00:00:00Z'),
    at('2025-06-12T00:00:00Z')
  );
  const [first, update] = summarizeDailyUpdates([firstPublish, at('2025-06-10T14:00:00Z')], daily, firstPublish);
  assert.equal(first.first, true);
  assert.equal(first.before, null);
  assert.equal(update.daily, true);
  assert.equal(update.before, 10);
  assert.equal(update.after, 15);
  assert.equal(update.change, 50);
});

test('getStats rejects a malformed id or range before touching the database', async () => {
  let res = mockRes();
  await getStats({ params: { id: 'not-an-id' }, query: {} }, res);
  assert.equal(res.statusCode, 400);

  res = mockRes();
  await getStats({ params: { id: new mongoose.Types.ObjectId().toString() }, query: { range: '1y' } }, res);
  assert.equal(res.statusCode, 400);
});
