const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Comment = require('../models/Comment');
const { addComment, RATE_LIMIT_COUNT } = require('../controllers/commentController');

// Full happy-path + rate-limit test against a real MongoDB connection.
// Skips automatically when MONGO_URI isn't set (e.g. before issue #8/#4 are done),
// so it never blocks a normal `npm test` run.
const skip = !process.env.MONGO_URI
  ? 'set MONGO_URI to run the live comments rate-limit test'
  : false;

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

test('a guest is blocked after 3 comments within a minute', { skip }, async (t) => {
  await mongoose.connect(process.env.MONGO_URI);
  const articleId = new mongoose.Types.ObjectId().toString();
  const guestId = `test-guest-${Date.now()}`;

  t.after(async () => {
    await Comment.deleteMany({ guestId });
    await mongoose.disconnect();
  });

  for (let i = 0; i < RATE_LIMIT_COUNT; i += 1) {
    const res = mockRes();
    await addComment(
      { params: { articleId }, body: { guestId, authorName: 'Dana', text: `comment ${i}` } },
      res,
    );
    assert.strictEqual(res.statusCode, 201, `comment ${i} should be accepted`);
  }

  const blockedRes = mockRes();
  await addComment(
    { params: { articleId }, body: { guestId, authorName: 'Dana', text: 'one too many' } },
    blockedRes,
  );
  assert.strictEqual(blockedRes.statusCode, 429);
});
