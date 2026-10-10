const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Article = require('../models/Article');
const { createArticle, saveDraft, submitArticle } = require('../controllers/reporterController');
const { approveArticle, returnArticle } = require('../controllers/editorController');

// The reporter's write / submit flow against a real MongoDB.
// Skips when MONGO_URI isn't set, so it never blocks a normal `npm test` run.
const skip = !process.env.MONGO_URI ? 'set MONGO_URI to run the live reporter flow test' : false;

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

const TEST_AUTHOR = 'reporter-flow-test';
const reporter = { _id: new mongoose.Types.ObjectId(), username: TEST_AUTHOR, role: 'reporter' };
const otherReporter = { _id: new mongoose.Types.ObjectId(), username: 'other-reporter', role: 'reporter' };
const editor = { username: 'test-editor', role: 'editor' };
const fullDraft = { title: 'Title', summary: 'Summary', image: '', category: 'Sports', content: 'Body' };

async function call(handler, req) {
  const res = mockRes();
  await handler(req, res);
  return res;
}

test('a reporter writes, submits and fixes their own article', { skip }, async (t) => {
  await mongoose.connect(process.env.MONGO_URI);
  t.after(async () => {
    await Article.deleteMany({ authorName: TEST_AUTHOR });
    await mongoose.disconnect();
  });

  let res = await call(createArticle, { user: reporter });
  assert.equal(res.statusCode, 201);
  const id = res.body._id.toString();
  assert.equal((await Article.findById(id).lean()).status, 'draft');

  // an empty draft can't be submitted
  res = await call(submitArticle, { params: { id }, user: reporter });
  assert.equal(res.statusCode, 400);

  // another reporter can neither edit nor submit it
  res = await call(saveDraft, { params: { id }, body: { title: 'Hijack' }, user: otherReporter });
  assert.equal(res.statusCode, 404);
  res = await call(submitArticle, { params: { id }, user: otherReporter });
  assert.equal(res.statusCode, 404);

  res = await call(saveDraft, { params: { id }, body: fullDraft, user: reporter });
  assert.equal(res.statusCode, 200);
  res = await call(submitArticle, { params: { id }, user: reporter });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, 'pending');

  // locked while the editor decides
  res = await call(saveDraft, { params: { id }, body: { title: 'Late change' }, user: reporter });
  assert.equal(res.statusCode, 400);

  await call(returnArticle, { params: { id }, body: { note: 'Add a source' }, user: editor });
  res = await call(saveDraft, { params: { id }, body: { content: 'Body, with a source' }, user: reporter });
  assert.equal(res.statusCode, 200);
  res = await call(submitArticle, { params: { id }, user: reporter });
  assert.equal(res.statusCode, 200);

  const resubmitted = await Article.findById(id).lean();
  assert.equal(resubmitted.status, 'pending');
  assert.equal(resubmitted.draft.content, 'Body, with a source');
  // never approved, so still not public
  assert.equal(resubmitted.publishDate, null);
});

test('editing a published article never changes what readers see until approval', { skip }, async (t) => {
  await mongoose.connect(process.env.MONGO_URI);
  t.after(async () => {
    await Article.deleteMany({ authorName: TEST_AUTHOR });
    await mongoose.disconnect();
  });

  const published = new Date('2026-10-01T09:00:00Z');
  const article = await Article.create({
    author: reporter._id,
    authorName: TEST_AUTHOR,
    title: 'Live title',
    summary: 'Live summary',
    category: 'News',
    content: 'Live body',
    status: 'published',
    publishDate: published,
    publishHistory: [published],
  });
  const id = article._id.toString();

  // nothing changed yet, so nothing to submit
  let res = await call(submitArticle, { params: { id }, user: reporter });
  assert.equal(res.statusCode, 400);

  // the first autosave opens a draft from the live version
  res = await call(saveDraft, { params: { id }, body: { title: 'New title' }, user: reporter });
  assert.equal(res.statusCode, 200);
  let saved = await Article.findById(id).lean();
  assert.equal(saved.title, 'Live title');
  assert.equal(saved.status, 'published');
  assert.equal(saved.draft.title, 'New title');
  assert.equal(saved.draft.content, 'Live body');

  res = await call(submitArticle, { params: { id }, user: reporter });
  assert.equal(res.body.status, 'pending');
  saved = await Article.findById(id).lean();
  assert.equal(saved.title, 'Live title');

  res = await call(approveArticle, { params: { id }, user: editor });
  assert.equal(res.statusCode, 200);
  saved = await Article.findById(id).lean();
  assert.equal(saved.title, 'New title');
  assert.equal(saved.draft, null);
  assert.equal(saved.publishHistory.length, 2);
});
