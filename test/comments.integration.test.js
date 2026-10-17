const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Comment = require('../models/Comment');
const {
  addComment,
  listComments,
  updateComment,
  deleteComment,
  RATE_LIMIT_COUNT,
} = require('../controllers/commentController');

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
    end() {
      return this;
    },
  };
}

test('a guest is blocked after 3 comments within a minute from the same IP', { skip }, async (t) => {
  await mongoose.connect(process.env.MONGO_URI);
  const articleId = new mongoose.Types.ObjectId().toString();
  // a made-up but unique-per-run "IP" so repeat test runs don't see each other's counts
  const ip = `203.0.113.${Date.now() % 256}`;

  t.after(async () => {
    await Comment.deleteMany({ guestId: ip });
    await mongoose.disconnect();
  });

  for (let i = 0; i < RATE_LIMIT_COUNT; i += 1) {
    const res = mockRes();
    await addComment(
      { ip, params: { articleId }, body: { authorName: 'Dana', text: `comment ${i}` } },
      res,
    );
    assert.strictEqual(res.statusCode, 201, `comment ${i} should be accepted`);
  }

  const blockedRes = mockRes();
  await addComment(
    { ip, params: { articleId }, body: { authorName: 'Dana', text: 'one too many' } },
    blockedRes,
  );
  assert.strictEqual(blockedRes.statusCode, 429);
});

test('search filters to comments whose text matches, case-insensitively', { skip }, async (t) => {
  await mongoose.connect(process.env.MONGO_URI);
  const articleId = new mongoose.Types.ObjectId().toString();
  const ip = `203.0.113.${(Date.now() + 1) % 256}`;

  t.after(async () => {
    await Comment.deleteMany({ article: articleId });
    await mongoose.disconnect();
  });

  await addComment(
    { ip, params: { articleId }, body: { authorName: 'Dana', text: 'what a Wonderful article' } },
    mockRes(),
  );
  await addComment(
    { ip: `${ip}-2`, params: { articleId }, body: { authorName: 'Avi', text: 'totally unrelated' } },
    mockRes(),
  );

  const res = mockRes();
  await listComments({ params: { articleId }, query: { q: 'wonderful' } }, res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.length, 1);
  assert.match(res.body[0].text, /wonderful/i);
});

test('an editor can update and then delete a comment; deleting it again is a 404', { skip }, async (t) => {
  await mongoose.connect(process.env.MONGO_URI);
  const articleId = new mongoose.Types.ObjectId().toString();
  const ip = `203.0.113.${(Date.now() + 2) % 256}`;

  t.after(async () => {
    await Comment.deleteMany({ article: articleId });
    await mongoose.disconnect();
  });

  const createRes = mockRes();
  await addComment(
    { ip, params: { articleId }, body: { authorName: 'Dana', text: 'original text' } },
    createRes,
  );
  const commentId = createRes.body._id.toString();

  const updateRes = mockRes();
  await updateComment(
    { params: { articleId, commentId }, body: { text: 'edited by the editor' } },
    updateRes,
  );
  assert.strictEqual(updateRes.statusCode, 200);
  assert.strictEqual(updateRes.body.text, 'edited by the editor');

  const deleteRes = mockRes();
  await deleteComment({ params: { articleId, commentId } }, deleteRes);
  assert.strictEqual(deleteRes.statusCode, 204);

  const secondDeleteRes = mockRes();
  await deleteComment({ params: { articleId, commentId } }, secondDeleteRes);
  assert.strictEqual(secondDeleteRes.statusCode, 404);
});
