const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Comment = require('../models/Comment');
const Article = require('../models/Article');
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

// listComments/addComment check the article exists and is published, so every test needs a
// real published one behind its articleId instead of a made-up ObjectId
async function createTestArticle() {
  const article = await Article.create({
    author: new mongoose.Types.ObjectId(),
    authorName: 'Test Author',
    title: 'Test article',
    summary: 'Test summary',
    category: 'News',
    publishDate: new Date(),
  });
  return article._id.toString();
}

test('a guest is blocked after 3 comments within a minute from the same IP', { skip }, async (t) => {
  await mongoose.connect(process.env.MONGO_URI);
  const articleId = await createTestArticle();
  // a made-up but unique-per-run "IP" so repeat test runs don't see each other's counts
  const ip = `203.0.113.${Date.now() % 256}`;

  t.after(async () => {
    await Comment.deleteMany({ guestId: ip });
    await Article.deleteOne({ _id: articleId });
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
  const articleId = await createTestArticle();
  const ip = `203.0.113.${(Date.now() + 1) % 256}`;

  t.after(async () => {
    await Comment.deleteMany({ article: articleId });
    await Article.deleteOne({ _id: articleId });
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
  assert.strictEqual(res.body.comments.length, 1);
  assert.match(res.body.comments[0].text, /wonderful/i);
});

test('an editor can update and then delete a comment; deleting it again is a 404', { skip }, async (t) => {
  await mongoose.connect(process.env.MONGO_URI);
  const articleId = await createTestArticle();
  const ip = `203.0.113.${(Date.now() + 2) % 256}`;

  t.after(async () => {
    await Comment.deleteMany({ article: articleId });
    await Article.deleteOne({ _id: articleId });
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

test('listComments and addComment both 404 on a well-formed id with no article behind it', { skip }, async (t) => {
  await mongoose.connect(process.env.MONGO_URI);
  const articleId = new mongoose.Types.ObjectId().toString(); // valid format, nothing created

  t.after(async () => {
    await mongoose.disconnect();
  });

  const listRes = mockRes();
  await listComments({ params: { articleId }, query: {} }, listRes);
  assert.strictEqual(listRes.statusCode, 404);

  const addRes = mockRes();
  await addComment(
    { ip: '203.0.113.50', params: { articleId }, body: { authorName: 'Dana', text: 'hi' } },
    addRes,
  );
  assert.strictEqual(addRes.statusCode, 404);
});

test('listComments and addComment 404 on an article that was never published', { skip }, async (t) => {
  await mongoose.connect(process.env.MONGO_URI);
  const draft = await Article.create({ author: new mongoose.Types.ObjectId(), authorName: 'Test Author' });
  const articleId = draft._id.toString();

  t.after(async () => {
    await Article.deleteOne({ _id: articleId });
    await mongoose.disconnect();
  });

  const listRes = mockRes();
  await listComments({ params: { articleId }, query: {} }, listRes);
  assert.strictEqual(listRes.statusCode, 404);

  const addRes = mockRes();
  await addComment(
    { ip: '203.0.113.51', params: { articleId }, body: { authorName: 'Dana', text: 'hi' } },
    addRes,
  );
  assert.strictEqual(addRes.statusCode, 404);
});

test('listComments paginates: 20 per page, hasMore until the last page', { skip }, async (t) => {
  await mongoose.connect(process.env.MONGO_URI);
  const articleId = await createTestArticle();

  t.after(async () => {
    await Comment.deleteMany({ article: articleId });
    await Article.deleteOne({ _id: articleId });
    await mongoose.disconnect();
  });

  const comments = Array.from({ length: 25 }, (_, i) => ({
    article: articleId,
    guestId: `203.0.113.${i}`,
    authorName: 'Dana',
    text: `comment number ${i}`,
  }));
  await Comment.insertMany(comments);

  const page1 = mockRes();
  await listComments({ params: { articleId }, query: {} }, page1);
  assert.strictEqual(page1.statusCode, 200);
  assert.strictEqual(page1.body.comments.length, 20);
  assert.strictEqual(page1.body.hasMore, true);

  // the next page starts after the last comment of the first one
  const before = String(page1.body.comments[19]._id);
  const page2 = mockRes();
  await listComments({ params: { articleId }, query: { before } }, page2);
  assert.strictEqual(page2.statusCode, 200);
  assert.strictEqual(page2.body.comments.length, 5);
  assert.strictEqual(page2.body.hasMore, false);

  // all 25, each exactly once
  const ids = [...page1.body.comments, ...page2.body.comments].map((c) => String(c._id));
  assert.strictEqual(new Set(ids).size, 25);
});

test('a comment posted between two pages does not show a comment twice', { skip }, async (t) => {
  await mongoose.connect(process.env.MONGO_URI);
  const articleId = await createTestArticle();
  const ip = '203.0.113.90';

  t.after(async () => {
    await Comment.deleteMany({ article: articleId });
    await Article.deleteOne({ _id: articleId });
    await mongoose.disconnect();
  });

  const start = Date.now() - 60 * 60 * 1000;
  await Comment.insertMany(Array.from({ length: 25 }, (_, i) => ({
    article: articleId,
    guestId: `203.0.113.${i}`,
    authorName: 'Dana',
    text: `comment number ${i}`,
    createdAt: new Date(start + i * 1000),
  })));

  const page1 = mockRes();
  await listComments({ params: { articleId }, query: {} }, page1);

  // the reader posts a comment, which goes to the top of the list
  const addRes = mockRes();
  await addComment({ ip, params: { articleId }, body: { authorName: 'Noa', text: 'new one' } }, addRes);
  assert.strictEqual(addRes.statusCode, 201);

  const page2 = mockRes();
  const before = String(page1.body.comments[19]._id);
  await listComments({ params: { articleId }, query: { before } }, page2);

  const page1Ids = page1.body.comments.map((c) => String(c._id));
  const page2Ids = page2.body.comments.map((c) => String(c._id));
  assert.strictEqual(page2Ids.length, 5);
  assert.ok(page2Ids.every((id) => !page1Ids.includes(id)));
});

test('listComments answers 404 when the before comment does not exist', { skip }, async (t) => {
  await mongoose.connect(process.env.MONGO_URI);
  const articleId = await createTestArticle();

  t.after(async () => {
    await Article.deleteOne({ _id: articleId });
    await mongoose.disconnect();
  });

  const res = mockRes();
  const before = String(new mongoose.Types.ObjectId());
  await listComments({ params: { articleId }, query: { before } }, res);
  assert.strictEqual(res.statusCode, 404);
});
