const test = require('node:test');
const assert = require('node:assert/strict');
const { devUser, requireAuth, requireRole, DEV_USERS } = require('../middleware/auth');

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
  const { nextArg } = run(requireAuth, apiReq(DEV_USERS.reporter));
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
  const { nextArg } = run(requireRole('editor'), apiReq(DEV_USERS.editor));
  assert.equal(nextArg, undefined);
});

test('requireRole answers 403 to the wrong role', () => {
  const { res } = run(requireRole('editor'), apiReq(DEV_USERS.reporter));
  assert.equal(res.statusCode, 403);
});

test('requireRole answers 401 when nobody is logged in', () => {
  const { res } = run(requireRole('editor'), apiReq(undefined));
  assert.equal(res.statusCode, 401);
});

test('devUser logs in as DEV_AS outside production', (t) => {
  t.after(() => {
    delete process.env.DEV_AS;
  });
  process.env.DEV_AS = 'editor';
  const req = {};
  run(devUser, req);
  assert.equal(req.user.role, 'editor');
});

test('devUser does nothing in production', (t) => {
  const oldEnv = process.env.NODE_ENV;
  t.after(() => {
    delete process.env.DEV_AS;
    process.env.NODE_ENV = oldEnv;
  });
  process.env.DEV_AS = 'editor';
  process.env.NODE_ENV = 'production';
  const req = {};
  run(devUser, req);
  assert.equal(req.user, undefined);
});

test('devUser ignores an unknown DEV_AS value', (t) => {
  t.after(() => {
    delete process.env.DEV_AS;
  });
  process.env.DEV_AS = 'admin';
  const req = {};
  run(devUser, req);
  assert.equal(req.user, undefined);
});
