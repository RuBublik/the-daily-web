const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Article = require('../models/Article');
const ViewStat = require('../models/ViewStat');
const { getStats } = require('../controllers/impactController');

// The stats endpoint against a real MongoDB.
// Skips when MONGO_URI isn't set, so it never blocks a normal `npm test` run.
const skip = !process.env.MONGO_URI ? 'set MONGO_URI to run the live statistics test' : false;
const HOUR = 60 * 60 * 1000;
const TEST_AUTHOR = 'Impact stats test';

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

test('stats return every hour of the range and a before / after per approval', { skip }, async (t) => {
  await mongoose.connect(process.env.MONGO_URI);
  t.after(async () => {
    const ids = (await Article.find({ authorName: TEST_AUTHOR }).select('_id').lean()).map((a) => a._id);
    await ViewStat.deleteMany({ article: { $in: ids } });
    await Article.deleteMany({ authorName: TEST_AUTHOR });
    await mongoose.disconnect();
  });

  const nowHour = ViewStat.startOfHour(new Date()).getTime();
  const firstPublish = new Date(nowHour - 72 * HOUR);
  const update = new Date(nowHour - 36 * HOUR + 15 * 60 * 1000);
  const article = await Article.create({
    author: new mongoose.Types.ObjectId(),
    authorName: TEST_AUTHOR,
    title: 'Stats test',
    summary: 'Summary',
    category: 'News',
    content: 'Body',
    status: 'published',
    publishDate: firstPublish,
    publishHistory: [firstPublish, update],
  });

  // 2 views per hour before the update, 6 per hour after it
  const updateHour = ViewStat.startOfHour(update).getTime();
  const buckets = [];
  for (let t2 = firstPublish.getTime(); t2 <= nowHour; t2 += HOUR) {
    buckets.push({ article: article._id, hour: new Date(t2), count: t2 < updateHour ? 2 : 6 });
  }
  await ViewStat.insertMany(buckets);

  const res = mockRes();
  await getStats({ params: { id: article._id.toString() }, query: { range: '7d' } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.buckets.length, 7 * 24);
  assert.equal(res.body.updates.length, 2);
  assert.equal(res.body.updates[0].first, true);
  assert.equal(res.body.updates[1].before, 2);
  assert.equal(res.body.updates[1].after, 6);
  assert.equal(res.body.updates[1].change, 200);

  // in the 24h range both approvals are outside: no markers
  const res24 = mockRes();
  await getStats({ params: { id: article._id.toString() }, query: { range: '24h' } }, res24);
  assert.equal(res24.body.buckets.length, 24);
  assert.equal(res24.body.updates.length, 0);
});

test('stats of an unknown article are 404', { skip }, async (t) => {
  await mongoose.connect(process.env.MONGO_URI);
  t.after(() => mongoose.disconnect());
  const res = mockRes();
  await getStats({ params: { id: new mongoose.Types.ObjectId().toString() }, query: {} }, res);
  assert.equal(res.statusCode, 404);
});
