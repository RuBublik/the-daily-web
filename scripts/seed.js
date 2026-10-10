// Fills the database with the demo data for the defense: users, 500+ articles in every status,
// comments, and up to 30 days of hourly views for the Impact chart.
//
//   npm run seed                  wipes and refills a local database (MONGO_URI in .env)
//   npm run seed -- --force       also a non-local one (e.g. Atlas); SEED_PASSWORD must be set
//
// The data is the same on every run (a seeded random generator), and every date is relative to
// now, so the charts always show the last days.

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { User } = require('../models/user');
const Article = require('../models/Article');
const Comment = require('../models/Comment');
const ViewStat = require('../models/ViewStat');
const categories = require('../config/categories');

const ARTICLE_COUNT = 520;
// how far back the view history goes; lower it if the database gets too big
const DAYS_OF_HISTORY = 30;
const DEFAULT_LOCAL_PASSWORD = 'q1w2e3r4';
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const BATCH_SIZE = 5000;

const USERS = [
  { username: 'pepe', role: 'editor' },
  { username: 'yossi', role: 'reporter' },
  { username: 'noa', role: 'reporter' },
  { username: 'dan', role: 'reporter' },
  { username: 'maya', role: 'reporter' },
];
const COMMENTER_NAMES = ['Avi', 'Noa', 'Yael', 'Omer', 'Tamar', 'Itay', 'Pepe'];

// a tiny random generator (mulberry32): the same seed always gives the same numbers,
// so every run creates the same articles, comments and view curves
function createRandom(seed) {
  let state = seed;
  return function random() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- placeholder text (replace these to get real-looking articles) ----------

const WORDS = ('lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut '
  + 'labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi '
  + 'aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum fugiat '
  + 'nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit '
  + 'anim id est laborum').split(' ');

function between(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}

function sentence(random) {
  const words = Array.from({ length: between(random, 8, 16) }, () => WORDS[between(random, 0, WORDS.length - 1)]);
  const text = words.join(' ');
  return text[0].toUpperCase() + text.slice(1) + '.';
}

function paragraph(random, sentences) {
  return Array.from({ length: sentences }, () => sentence(random)).join(' ');
}

function articleText(random, number, category) {
  return {
    title: `Sample article ${number}`,
    summary: paragraph(random, 2),
    image: `https://picsum.photos/seed/article-${number}/800/450`,
    category,
    // 3 to 5 paragraphs; the article page prints each one as a <p>
    content: Array.from({ length: between(random, 3, 5) }, () => paragraph(random, between(random, 3, 5))).join('\n\n'),
  };
}

// ---------- generating the data (no database here) ----------

// the view history of one published article: popularity x time of day x fading with age,
// times a jump up or down after each update, so the Impact chart shows a before / after
function generateViews(random, article, now) {
  const popularity = 1 + 30 * random() ** 3; // views per hour at its best; most articles are quiet
  const updates = article.publishHistory.slice(1).map((at) => ({
    at: at.getTime(),
    // most updates bring more readers, some bring fewer
    factor: random() < 0.7 ? 1.5 + random() : 0.4 + 0.3 * random(),
  }));

  const buckets = [];
  const published = article.publishDate.getTime();
  const end = ViewStat.startOfHour(now).getTime();
  for (let hour = ViewStat.startOfHour(article.publishDate).getTime(); hour <= end; hour += HOUR_MS) {
    const ageDays = (hour - published) / DAY_MS;
    const timeOfDay = 0.3 + 0.7 * (1 + Math.sin(((new Date(hour).getUTCHours() - 9) / 24) * 2 * Math.PI)) / 2;
    const fade = 0.3 + 0.7 * Math.exp(-ageDays / 7);
    const boost = updates.filter((u) => u.at <= hour + HOUR_MS).reduce((total, u) => total * u.factor, 1);
    const count = Math.round(popularity * timeOfDay * fade * boost * (0.6 + 0.8 * random()));
    // an hour nobody viewed is simply not stored; the chart shows it as 0
    if (count > 0) {
      buckets.push({ article: article._id, hour: new Date(hour), count });
    }
  }
  return { buckets, popularity };
}

function generateComments(random, article, now, popularity) {
  const count = Math.min(10, Math.floor(random() * (2 + popularity / 3)));
  const published = article.publishDate.getTime();
  return Array.from({ length: count }, (_, i) => ({
    article: article._id,
    guestId: `seed-${article._id}-${i}`,
    authorName: COMMENTER_NAMES[between(random, 0, COMMENTER_NAMES.length - 1)],
    text: paragraph(random, between(random, 1, 2)),
    createdAt: new Date(published + random() * (now.getTime() - published)),
  }));
}

// everything to insert, from a fixed "now" and seed; `reporters` are { _id, username }
function generateData(now, reporters, seed = 42) {
  const random = createRandom(seed);
  const articles = [];
  const comments = [];
  const viewStats = [];
  const daysAgo = (days) => new Date(now.getTime() - days * DAY_MS);

  for (let number = 1; number <= ARTICLE_COUNT; number += 1) {
    const category = categories[number % categories.length];
    const author = reporters[number % reporters.length];
    const text = articleText(random, number, category);
    const base = { _id: new mongoose.Types.ObjectId(), author: author._id, authorName: author.username };
    const roll = random();

    if (roll < 0.6) {
      // published, some of them updated later
      const publishDate = daysAgo(1 + random() * (DAYS_OF_HISTORY - 1));
      const publishHistory = [publishDate];
      if (random() < 0.2) {
        let last = publishDate.getTime();
        for (let i = between(random, 1, 3); i > 0; i -= 1) {
          last += (now.getTime() - 6 * HOUR_MS - last) * (0.3 + 0.4 * random());
          publishHistory.push(new Date(last));
        }
      }
      const article = {
        ...base, ...text, status: 'published', publishDate, publishHistory, lastUpdated: publishHistory.at(-1),
      };
      // a few have an update in progress or waiting for the editor; the public still sees the live version
      if (random() < 0.07) {
        article.draft = { ...text, title: `${text.title} (updated)` };
        article.status = random() < 0.5 ? 'pending' : 'published';
        article.lastUpdated = daysAgo(random() * 0.5);
      }
      // a separate random stream per article: how many hours exist depends on when the seed runs,
      // and that must not change the articles generated after this one
      const articleRandom = createRandom(seed * 100000 + number);
      const { buckets, popularity } = generateViews(articleRandom, article, now);
      article.viewCount = buckets.reduce((total, bucket) => total + bucket.count, 0);
      viewStats.push(...buckets);
      comments.push(...generateComments(articleRandom, article, now, popularity));
      articles.push(article);
    } else {
      // never published: only a draft, in one of the other states
      const status = roll < 0.7 ? 'pending' : roll < 0.85 ? 'draft' : 'returned';
      articles.push({
        ...base,
        status,
        draft: text,
        editorNote: status === 'returned' ? 'Please add a source and shorten the summary.' : '',
        lastUpdated: daysAgo(random() * DAYS_OF_HISTORY),
      });
    }
  }

  return { articles, comments, viewStats };
}

// ---------- writing it to the database ----------

function isLocal(uri) {
  const host = new URL(uri).hostname;
  return ['localhost', '127.0.0.1', '[::1]'].includes(host);
}

async function insertInBatches(Model, docs, label) {
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    await Model.insertMany(docs.slice(i, i + BATCH_SIZE), { ordered: false });
    process.stdout.write(`\r  ${label}: ${Math.min(i + BATCH_SIZE, docs.length)} / ${docs.length}`);
  }
  process.stdout.write('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error('MONGO_URI is not set - check .env');
  }
  const local = isLocal(uri);
  if (!local && !args.includes('--force')) {
    throw new Error(`Refusing to wipe a non-local database (${new URL(uri).hostname}). Add --force if you mean it.`);
  }
  const password = process.env.SEED_PASSWORD || (local ? DEFAULT_LOCAL_PASSWORD : null);
  if (!password) {
    throw new Error('Set SEED_PASSWORD in .env before seeding a non-local database.');
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  console.log(`Seeding ${mongoose.connection.host} / ${mongoose.connection.name}`);

  await Promise.all([User.deleteMany({}), Article.deleteMany({}), Comment.deleteMany({}), ViewStat.deleteMany({})]);

  const rounds = Math.min(Math.max(Number(process.env.BCRYPT_ROUNDS || 10), 8), 14);
  const passwordHash = await bcrypt.hash(password, rounds);
  const users = await User.insertMany(USERS.map((user) => ({ ...user, passwordHash })));
  const reporters = users.filter((user) => user.role === 'reporter');

  const { articles, comments, viewStats } = generateData(new Date(), reporters);
  await insertInBatches(Article, articles, 'articles');
  await insertInBatches(Comment, comments, 'comments');
  await insertInBatches(ViewStat, viewStats, 'view statistics (hourly)');

  for (const Model of [User, Article, Comment, ViewStat]) {
    await Model.syncIndexes();
  }

  const stats = await mongoose.connection.db.stats();
  const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1);
  const counts = articles.reduce((acc, a) => ({ ...acc, [a.status]: (acc[a.status] || 0) + 1 }), {});
  console.log(`Done: ${users.length} users, ${articles.length} articles ${JSON.stringify(counts)}, `
    + `${comments.length} comments, ${viewStats.length} hourly view buckets.`);
  console.log(`Database size: ${mb(stats.dataSize)} MB data, ${mb(stats.storageSize + stats.indexSize)} MB on disk with indexes.`);
  console.log(`Log in as: ${USERS.map((u) => u.username).join(', ')}`
    + ` - password: ${process.env.SEED_PASSWORD ? 'SEED_PASSWORD from .env' : DEFAULT_LOCAL_PASSWORD}`);
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error('Seeding failed:', err.message);
      process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
}

module.exports = { generateData, createRandom, ARTICLE_COUNT, DAYS_OF_HISTORY };
