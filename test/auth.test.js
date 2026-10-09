const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { User } = require('../models/user');
const controller = require('../controllers/authController');
const { requireRole, authenticateJwt } = require('../middleware/authMiddleware');

function makeUser(overrides = {}) {
  return new User({
    username: 'dana_cohen',
    passwordHash: 'hashed_password_example',
    role: 'reporter',
    ...overrides,
  });
}

test('a fully-filled user passes validation', () => {
  assert.strictEqual(makeUser().validateSync(), undefined);
});

test('accepts role "editor" and "reporter"', () => {
  assert.strictEqual(makeUser({ role: 'editor' }).validateSync(), undefined);
  assert.strictEqual(makeUser({ role: 'reporter' }).validateSync(), undefined);
});

test('rejects missing name/username', () => {
  const err = makeUser({ username: '' }).validateSync();
  assert.ok(err && err.errors.username);
});

test('rejects name/username over 100 characters', () => {
  const err = makeUser({ username: 'a'.repeat(101) }).validateSync();
  assert.ok(err && err.errors.username);
});

test('rejects missing passwordHash', () => {
  const err = makeUser({ passwordHash: '' }).validateSync();
  assert.ok(err && err.errors.passwordHash);
});

function mockResponse() {
  const res = {
    statusCode: 200,
    renderedView: null,
    renderData: null,
    redirectUrl: null,
    cookieName: null,
    cookieValue: null,
    jsonBody: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    render(view, data) {
      this.renderedView = view;
      this.renderData = data;
      return this;
    },
    redirect(url) {
      this.redirectUrl = url;
      return this;
    },
    cookie(name, value, options) {
      this.cookieName = name;
      this.cookieValue = value;
      return this;
    },
    json(data) {
      this.jsonBody = data;
      return this;
    }
  };
  return res;
}

test('register rejects request when username is missing', async () => {
  const req = {
    body: {
      username: '',
      password: 'password123',
      role: 'reporter'
    }
  };
  const res = mockResponse();

  await controller.register(req, res, (err) => { throw err; });

  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.renderedView, 'auth/register');
  assert.match(res.renderData.error, /Username and a password/);
});

test('register rejects short password (less than 8 characters)', async () => {
  const req = {
    body: {
      username: 'dana_cohen',
      password: '123',
      role: 'reporter'
    }
  };
  const res = mockResponse();

  await controller.register(req, res, (err) => { throw err; });

  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.renderedView, 'auth/register');
  assert.match(res.renderData.error, /at least 8 characters/);
});

test('register editor fails when editor_SIGNUP_CODE is disabled in env', async () => {
  delete process.env.editor_SIGNUP_CODE;
  const req = {
    body: {
      username: 'editor_user',
      password: 'password123',
      role: 'editor',
      editorCode: 'SOME_CODE'
    }
  };
  const res = mockResponse();

  await controller.register(req, res, (err) => { throw err; });

  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.renderData.error, 'editor registration is currently disabled');
});

test('register editor fails if editorCode is invalid', async () => {
  process.env.editor_SIGNUP_CODE = 'CORRECT_CODE';
  const req = {
    body: {
      username: 'editor_user',
      password: 'password123',
      role: 'editor',
      editorCode: 'WRONG_CODE'
    }
  };
  const res = mockResponse();

  await controller.register(req, res, (err) => { throw err; });

  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.renderData.error, 'The editor registration code is invalid');
});

test('login fails with missing username or password', async () => {
  const req = {
    body: {
      username: '',
      password: ''
    }
  };
  const res = mockResponse();

  await controller.login(req, res, (err) => { throw err; });

  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(res.renderedView, 'auth/login');
  assert.strictEqual(res.renderData.error, 'Username and password are required');
});

test('login fails when username is not found', async () => {
  const originalFindOne = User.findOne;
  User.findOne = () => ({
    select: () => Promise.resolve(null)
  });

  const req = {
    body: {
      username: 'notfound_user',
      password: 'password123'
    }
  };
  const res = mockResponse();

  await controller.login(req, res, (err) => { throw err; });

  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(res.renderData.error, 'Invalid username or password');

  User.findOne = originalFindOne;
});

test('requireRole middleware allows access when user role matches', () => {
  const middleware = requireRole('editor');
  const req = { user: { role: 'editor' } };
  const res = mockResponse();
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.strictEqual(nextCalled, true);
});

test('requireRole middleware blocks access (401) when role does not match', () => {
  const middleware = requireRole('editor');
  const req = { user: { role: 'reporter' } };
  const res = mockResponse();
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(res.jsonBody.message, 'You do not have permission to perform this action');
});

test('authenticateJwt middleware blocks access (401) on invalid token', async () => {
  process.env.JWT_SECRET = 'secret';
  const req = {
    headers: { authorization: 'Bearer invalid_token_value' }
  };
  const res = mockResponse();

  await authenticateJwt(req, res, () => {});

  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(res.jsonBody.message, 'Invalid or expired token');
});