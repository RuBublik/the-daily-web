const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const {
  listComments,
  addComment,
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

test('wouldExceedRateLimit allows up to RATE_LIMIT_COUNT - 1 recent comments', () => {
  assert.strictEqual(wouldExceedRateLimit(0), false);
  assert.strictEqual(wouldExceedRateLimit(RATE_LIMIT_COUNT - 1), false);
});

test('wouldExceedRateLimit blocks the 3rd comment within the window and beyond', () => {
  assert.strictEqual(wouldExceedRateLimit(RATE_LIMIT_COUNT), true);
  assert.strictEqual(wouldExceedRateLimit(RATE_LIMIT_COUNT + 5), true);
});
