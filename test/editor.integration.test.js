const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Article = require('../models/Article');
const { approveArticle, returnArticle } = require('../controllers/editorController');

// The editor's approve / return flow against a real MongoDB.
// Skips when MONGO_URI isn't set, so it never blocks a normal `npm test` run.
const skip = !process.env.MONGO_URI ? 'set MONGO_URI to run the live editor flow test' : false;

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

const editor = { username: 'test-editor', role: 'editor' };
const reporter = { username: 'test-reporter', role: 'reporter' };
const TEST_AUTHOR = 'Editor flow test';

test('an update to a published article goes live only when the editor approves it', { skip }, async (t) => {
  await mongoose.connect(process.env.MONGO_URI);
  t.after(async () => {
    await Article.deleteMany({ authorName: TEST_AUTHOR });
    await mongoose.disconnect();
  });

  const firstPublish = new Date('2026-10-01T09:00:00Z');
  const article = await Article.create({
    author: new mongoose.Types.ObjectId(),
    authorName: TEST_AUTHOR,
    title: 'Live title',
    summary: 'Live summary',
    category: 'News',
    content: 'Live body',
    publishDate: firstPublish,
    publishHistory: [firstPublish],
    status: 'pending',
    draft: { title: 'Updated title', summary: 'Live summary', category: 'News', content: 'Updated body' },
  });
  const id = article._id.toString();

  // a reporter can't approve, even by calling the controller directly
  let res = mockRes();
  await approveArticle({ params: { id }, user: reporter }, res);
  assert.equal(res.statusCode, 400);

  res = mockRes();
  await approveArticle({ params: { id }, user: editor }, res);
  assert.equal(res.statusCode, 200);

  const approved = await Article.findById(id).lean();
  assert.equal(approved.title, 'Updated title');
  assert.equal(approved.content, 'Updated body');
  assert.equal(approved.draft, null);
  assert.equal(approved.status, 'published');
  assert.equal(approved.publishDate.getTime(), firstPublish.getTime());
  assert.equal(approved.publishHistory.length, 2);

  // nothing left to approve or return
  res = mockRes();
  await approveArticle({ params: { id }, user: editor }, res);
  assert.equal(res.statusCode, 400);
  res = mockRes();
  await returnArticle({ params: { id }, body: { note: 'Fix it' }, user: editor }, res);
  assert.equal(res.statusCode, 400);
});

test('returning keeps the draft for the reporter and the live version public', { skip }, async (t) => {
  await mongoose.connect(process.env.MONGO_URI);
  t.after(async () => {
    await Article.deleteMany({ authorName: TEST_AUTHOR });
    await mongoose.disconnect();
  });

  const article = await Article.create({
    author: new mongoose.Types.ObjectId(),
    authorName: TEST_AUTHOR,
    title: 'Live title',
    summary: 'Live summary',
    category: 'News',
    content: 'Live body',
    publishDate: new Date(),
    status: 'pending',
    draft: { title: 'Updated title', content: 'Updated body' },
  });
  const id = article._id.toString();

  const res = mockRes();
  await returnArticle({ params: { id }, body: { note: 'Please add a source' }, user: editor }, res);
  assert.equal(res.statusCode, 200);

  const returned = await Article.findById(id).lean();
  assert.equal(returned.status, 'returned');
  assert.equal(returned.editorNote, 'Please add a source');
  assert.equal(returned.draft.title, 'Updated title');
  assert.equal(returned.title, 'Live title');
  assert.ok(returned.publishDate);
});
