const test = require('node:test');
const assert = require('node:assert/strict');
const { requireAuth, requireRole } = require('../middleware/auth');

const reporter = { username: 'reporter', role: 'reporter' };
const editor = { username: 'editor', role: 'editor' };

function mockRes() {
  return {
    statusCode: 200,
    body: undefined,
    locals: {},
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

// runs one middleware, returns what it did: called next (and with what), or answered
function run(middleware, req) {
  const res = mockRes();
  let nextArg = 'not called';
  middleware(req, res, (arg) => {
    nextArg = arg;
  });
  return { res, nextArg };
}

const apiReq = (user) => ({ originalUrl: '/api/editor/articles', user });
const pageReq = (user) => ({ originalUrl: '/editor', user });

test('requireAuth lets a logged-in user through', () => {
  const { nextArg } = run(requireAuth, apiReq(reporter));
  assert.equal(nextArg, undefined);
});

test('requireAuth answers 401 JSON to an API call without a user', () => {
  const { res, nextArg } = run(requireAuth, apiReq(undefined));
  assert.equal(res.statusCode, 401);
  assert.ok(res.body.error);
  assert.equal(nextArg, 'not called');
});

test('requireAuth sends a page request without a user to the 401 error page', () => {
  const { nextArg } = run(requireAuth, pageReq(undefined));
  assert.equal(nextArg.status, 401);
});

test('requireRole lets the right role through', () => {
  const { nextArg } = run(requireRole('editor'), apiReq(editor));
  assert.equal(nextArg, undefined);
});

test('requireRole answers 403 to the wrong role', () => {
  const { res } = run(requireRole('editor'), apiReq(reporter));
  assert.equal(res.statusCode, 403);
});

test('requireRole answers 401 when nobody is logged in', () => {
  const { res } = run(requireRole('editor'), apiReq(undefined));
  assert.equal(res.statusCode, 401);
});
