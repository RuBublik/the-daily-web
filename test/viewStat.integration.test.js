const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const ViewStat = require('../models/ViewStat');

// View counting against a real MongoDB.
// Skips when MONGO_URI isn't set, so it never blocks a normal `npm test` run.
const skip = !process.env.MONGO_URI ? 'set MONGO_URI to run the live view counting test' : false;

test('views of the same hour go into one bucket, a new hour starts a new one', { skip }, async (t) => {
  await mongoose.connect(process.env.MONGO_URI);
  await ViewStat.syncIndexes();
  const article = new mongoose.Types.ObjectId();
  t.after(async () => {
    await ViewStat.deleteMany({ article });
    await mongoose.disconnect();
  });

  await ViewStat.record(article, new Date('2026-10-10T14:05:00Z'));
  await ViewStat.record(article, new Date('2026-10-10T14:55:00Z'));
  await ViewStat.record(article, new Date('2026-10-10T15:01:00Z'));

  const buckets = await ViewStat.find({ article }).sort({ hour: 1 }).lean();
  assert.deepEqual(
    buckets.map((b) => [b.hour.toISOString(), b.count]),
    [['2026-10-10T14:00:00.000Z', 2], ['2026-10-10T15:00:00.000Z', 1]]
  );
});

test('many simultaneous first views of an hour are all counted, in one bucket', { skip }, async (t) => {
  await mongoose.connect(process.env.MONGO_URI);
  await ViewStat.syncIndexes();
  const article = new mongoose.Types.ObjectId();
  t.after(async () => {
    await ViewStat.deleteMany({ article });
    await mongoose.disconnect();
  });

  // all at once, before the bucket exists: some upserts collide on the unique index and retry
  const at = new Date('2026-10-10T16:30:00Z');
  await Promise.all(Array.from({ length: 50 }, () => ViewStat.record(article, at)));

  const buckets = await ViewStat.find({ article }).lean();
  assert.equal(buckets.length, 1);
  assert.equal(buckets[0].count, 50);
});
