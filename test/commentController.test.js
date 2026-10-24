const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const {
  listComments,
  addComment,
  updateComment,
  deleteComment,
  wouldExceedRateLimit,
  RATE_LIMIT_COUNT,
} = require('../controllers/commentController');

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

const validArticleId = () => new mongoose.Types.ObjectId().toString();

test('GET rejects an invalid articleId with 400, no database needed', async () => {
  const res = mockRes();
  await listComments({ params: { articleId: 'not-an-id' } }, res);
  assert.strictEqual(res.statusCode, 400);
});

test('POST rejects an invalid articleId with 400, no database needed', async () => {
  const res = mockRes();
  await addComment({ params: { articleId: 'not-an-id' }, body: {} }, res);
  assert.strictEqual(res.statusCode, 400);
});

test('POST rejects an empty/whitespace-only authorName with 400', async () => {
  const res = mockRes();
  const req = {
    ip: '127.0.0.1',
    params: { articleId: validArticleId() },
    body: { authorName: '   ', text: 'hi there' },
  };
  await addComment(req, res);
  assert.strictEqual(res.statusCode, 400);
});

test('POST rejects an empty/whitespace-only text with 400', async () => {
  const res = mockRes();
  const req = {
    ip: '127.0.0.1',
    params: { articleId: validArticleId() },
    body: { authorName: 'Dana', text: '   ' },
  };
  await addComment(req, res);
  assert.strictEqual(res.statusCode, 400);
});

test('GET rejects a non-string q (e.g. ?q[]=x) with 400, no database needed', async () => {
  const res = mockRes();
  await listComments({ params: { articleId: validArticleId() }, query: { q: ['x'] } }, res);
  assert.strictEqual(res.statusCode, 400);
});

test('GET rejects a q over 100 characters with 400, no database needed', async () => {
  const res = mockRes();
  const req = { params: { articleId: validArticleId() }, query: { q: 'a'.repeat(101) } };
  await listComments(req, res);
  assert.strictEqual(res.statusCode, 400);
});

test('GET rejects a before that is not a comment id with 400, no database needed', async () => {
  const res = mockRes();
  const req = { params: { articleId: validArticleId() }, query: { before: '2' } };
  await listComments(req, res);
  assert.strictEqual(res.statusCode, 400);
});

test('GET rejects a non-string before (e.g. ?before[]=x) with 400, no database needed', async () => {
  const res = mockRes();
  const req = { params: { articleId: validArticleId() }, query: { before: [validArticleId()] } };
  await listComments(req, res);
  assert.strictEqual(res.statusCode, 400);
});

test('PATCH rejects an invalid articleId or commentId with 400, no database needed', async () => {
  const res = mockRes();
  await updateComment(
    { params: { articleId: 'not-an-id', commentId: validArticleId() }, body: { text: 'hi' } },
    res,
  );
  assert.strictEqual(res.statusCode, 400);
});

test('PATCH rejects an empty/whitespace-only text with 400, no database needed', async () => {
  const res = mockRes();
  const req = {
    params: { articleId: validArticleId(), commentId: validArticleId() },
    body: { text: '   ' },
  };
  await updateComment(req, res);
  assert.strictEqual(res.statusCode, 400);
});

test('PATCH rejects text over 1000 characters with 400, no database needed', async () => {
  const res = mockRes();
  const req = {
    params: { articleId: validArticleId(), commentId: validArticleId() },
    body: { text: 'a'.repeat(1001) },
  };
  await updateComment(req, res);
  assert.strictEqual(res.statusCode, 400);
});

test('DELETE rejects an invalid articleId or commentId with 400, no database needed', async () => {
  const res = mockRes();
  await deleteComment(
    { params: { articleId: validArticleId(), commentId: 'not-an-id' } },
    res,
  );
  assert.strictEqual(res.statusCode, 400);
});

test('wouldExceedRateLimit allows up to RATE_LIMIT_COUNT - 1 recent comments', () => {
  assert.strictEqual(wouldExceedRateLimit(0), false);
  assert.strictEqual(wouldExceedRateLimit(RATE_LIMIT_COUNT - 1), false);
});

test('wouldExceedRateLimit blocks the 3rd comment within the window and beyond', () => {
  assert.strictEqual(wouldExceedRateLimit(RATE_LIMIT_COUNT), true);
  assert.strictEqual(wouldExceedRateLimit(RATE_LIMIT_COUNT + 5), true);
});
