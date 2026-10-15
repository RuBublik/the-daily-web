// Fills the database with the demo data for the defense: users, 500+ articles in every status,
// comments, and up to 30 days of hourly views for the Impact chart.
//
//   npm run seed                  wipes and refills a local database (MONGO_URI in .env)
//   npm run seed -- --force       also a non-local one (e.g. Atlas); SEED_PASSWORD must be set
//
// On a local database every user gets the password q1w2e3r4 (SEED_PASSWORD is only for a remote one).
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
const DailyViewStat = require('../models/DailyViewStat');
const categories = require('../config/categories');

const ARTICLE_COUNT = 520;
// how far back the view history goes; lower it if the database gets too big
const DAYS_OF_HISTORY = 30;
// published articles 1 to 3 years old, to show the daily and monthly chart steps
const OLD_ARTICLE_COUNT = 10;
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
  // views per hour at its best; most articles are quiet. An old article must have kept some readers,
  // otherwise its years of history round down to almost nothing
  const minimum = article.publishDate.getTime() < now.getTime() - 365 * DAY_MS ? 8 : 1;
  const popularity = minimum + 30 * random() ** 3;
  const updates = article.publishHistory.slice(1).map((at) => ({
    at: at.getTime(),
    // most updates bring more readers, some bring fewer
    factor: random() < 0.7 ? 1.5 + random() : 0.4 + 0.3 * random(),
  }));

  const buckets = [];
  const days = new Map();
  const published = article.publishDate.getTime();
  const end = ViewStat.startOfHour(now).getTime();
  // hourly buckets older than this would be deleted by the TTL index, so only the daily totals are kept
  const hourlyKeptFrom = end - (ViewStat.RETENTION_DAYS - 1) * DAY_MS;
  for (let hour = ViewStat.startOfHour(article.publishDate).getTime(); hour <= end; hour += HOUR_MS) {
    const ageDays = (hour - published) / DAY_MS;
    const timeOfDay = 0.3 + 0.7 * (1 + Math.sin(((new Date(hour).getUTCHours() - 9) / 24) * 2 * Math.PI)) / 2;
    const fade = 0.3 + 0.7 * Math.exp(-ageDays / 7);
    const boost = updates.filter((u) => u.at <= hour + HOUR_MS).reduce((total, u) => total * u.factor, 1);
    const count = Math.round(popularity * timeOfDay * fade * boost * (0.6 + 0.8 * random()));
    // an hour nobody viewed is simply not stored; the chart shows it as 0
    if (count > 0) {
      if (hour >= hourlyKeptFrom) {
        buckets.push({ article: article._id, hour: new Date(hour), count });
      }
      const day = DailyViewStat.startOfDay(new Date(hour)).getTime();
      days.set(day, (days.get(day) || 0) + count);
    }
  }
  const dailyBuckets = [...days].map(([day, count]) => ({ article: article._id, day: new Date(day), count }));
  return { buckets, dailyBuckets, popularity };
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
  const dailyViewStats = [];
  const daysAgo = (days) => new Date(now.getTime() - days * DAY_MS);

  for (let number = 1; number <= ARTICLE_COUNT + OLD_ARTICLE_COUNT; number += 1) {
    const old = number > ARTICLE_COUNT;
    const category = categories[number % categories.length];
    const author = reporters[number % reporters.length];
    const text = articleText(random, number, category);
    const base = { _id: new mongoose.Types.ObjectId(), author: author._id, authorName: author.username };
    const roll = random();

    if (old || roll < 0.6) {
      // published, some of them updated later; the old ones 1 to 3 years ago, always updated
      const publishDate = old ? daysAgo(365 + random() * 2 * 365) : daysAgo(1 + random() * (DAYS_OF_HISTORY - 1));
      const publishHistory = [publishDate];
      if (old || random() < 0.2) {
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
        // the draft is edited after the last approval, never before it
        article.lastUpdated = new Date(Math.max(daysAgo(random() * 0.5).getTime(), publishHistory.at(-1).getTime()));
      }
      // a separate random stream per article: how many hours exist depends on when the seed runs,
      // and that must not change the articles generated after this one
      const articleRandom = createRandom(seed * 100000 + number);
      const { buckets, dailyBuckets, popularity } = generateViews(articleRandom, article, now);
      article.viewCount = dailyBuckets.reduce((total, bucket) => total + bucket.count, 0);
      viewStats.push(...buckets);
      dailyViewStats.push(...dailyBuckets);
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

  return { articles, comments, viewStats, dailyViewStats };
}

// ---------- writing it to the database ----------

// the hosts of a MongoDB URI, without ports: the part after "//" (and any user:password@), up to
// the database name. A replica set lists several hosts, which `new URL()` cannot parse
function hostsOf(uri) {
  const authority = uri.replace(/^[a-z+]+:\/\//i, '').split('/')[0].split('?')[0];
  return authority.split('@').pop().split(',').map((host) => host.replace(/:\d+$/, ''));
}

function isLocal(uri) {
  return hostsOf(uri).every((host) => ['localhost', '127.0.0.1', '[::1]'].includes(host));
}

// inserts in order and stops at the first invalid document, so nothing is dropped silently.
// returns how many were inserted
async function insertInBatches(Model, docs, label) {
  let inserted = 0;
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    inserted += (await Model.insertMany(docs.slice(i, i + BATCH_SIZE))).length;
    process.stdout.write(`\r  ${label}: ${inserted} / ${docs.length}`);
  }
  process.stdout.write('\n');
  return inserted;
}

const MODELS = [User, Article, Comment, ViewStat, DailyViewStat];

async function countAll() {
  const counts = await Promise.all(MODELS.map((Model) => Model.estimatedDocumentCount()));
  return MODELS.map((Model, i) => `${counts[i]} ${Model.collection.collectionName}`).join(', ');
}

async function main() {
  const args = process.argv.slice(2);
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error('MONGO_URI is not set - check .env');
  }
  const local = isLocal(uri);
  if (!local && !args.includes('--force')) {
    throw new Error(`Refusing to wipe a non-local database (${hostsOf(uri).join(', ')}). Add --force if you mean it.`);
  }
  // a local database is for development: always the known default, whatever .env says
  const password = local ? DEFAULT_LOCAL_PASSWORD : process.env.SEED_PASSWORD;
  if (!password) {
    throw new Error('Set SEED_PASSWORD in .env before seeding a non-local database.');
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  console.log(`Seeding ${mongoose.connection.host} / ${mongoose.connection.name}`);

  const rounds = Math.min(Math.max(Number(process.env.BCRYPT_ROUNDS || 10), 8), 14);
  const passwordHash = await bcrypt.hash(password, rounds);
  const inserted = {};
  try {
    await Promise.all(MODELS.map((Model) => Model.deleteMany({})));
    // the indexes first, so every insert below is already checked by them (e.g. one bucket per hour)
    for (const Model of MODELS) {
      await Model.syncIndexes();
    }

    const users = await User.insertMany(USERS.map((user) => ({ ...user, passwordHash })));
    const reporters = users.filter((user) => user.role === 'reporter');
    const { articles, comments, viewStats, dailyViewStats } = generateData(new Date(), reporters);
    // articles before what points at them: if an article fails, its comments and views are never written
    inserted.articles = await insertInBatches(Article, articles, 'articles');
    inserted.comments = await insertInBatches(Comment, comments, 'comments');
    inserted.hourly = await insertInBatches(ViewStat, viewStats, 'view statistics (hourly)');
    inserted.daily = await insertInBatches(DailyViewStat, dailyViewStats, 'view statistics (daily)');
    inserted.statuses = articles.reduce((acc, a) => ({ ...acc, [a.status]: (acc[a.status] || 0) + 1 }), {});
    inserted.users = users.length;
  } catch (err) {
    // the wipe already happened: say what is in the database now, so nobody has to guess
    const left = await countAll().catch(() => 'unknown (could not count)');
    throw new Error(`${err.message}\n  The database is only partly seeded: ${left}. Run the seed again.`);
  }

  console.log(`Done: ${inserted.users} users, ${inserted.articles} articles ${JSON.stringify(inserted.statuses)}, `
    + `${inserted.comments} comments, ${inserted.hourly} hourly and ${inserted.daily} daily view buckets.`);
  // only a report: the data is complete even if this fails
  try {
    const stats = await mongoose.connection.db.stats();
    const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1);
    console.log(`Database size: ${mb(stats.dataSize)} MB data, ${mb(stats.storageSize + stats.indexSize)} MB on disk with indexes.`);
  } catch (err) {
    console.log(`(could not read the database size: ${err.message})`);
  }
  console.log(`Log in as: ${USERS.map((u) => u.username).join(', ')}`
    + ` - password: ${local ? DEFAULT_LOCAL_PASSWORD : 'SEED_PASSWORD from .env'}`);
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error('Seeding failed:', err.message);
      process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
}

module.exports = { generateData, createRandom, isLocal, ARTICLE_COUNT, OLD_ARTICLE_COUNT, DAYS_OF_HISTORY };
