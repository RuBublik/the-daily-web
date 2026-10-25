// Impact Analytics: views of one article over time, and how they changed around each approval.
// Views are stored in hourly buckets for the last 90 days (models/ViewStat.js) and in daily
// buckets forever (models/DailyViewStat.js). A chart never has more than about 750 points:
// up to 31 days it shows hours, up to 2 years days, and beyond that months.

const mongoose = require('mongoose');
const Article = require('../models/Article');
const ViewStat = require('../models/ViewStat');
const DailyViewStat = require('../models/DailyViewStat');

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MAX_HOURLY_SPAN = 31 * DAY_MS;
const MAX_DAILY_SPAN = 2 * 365 * DAY_MS;
// how far back each range button looks, in hours ("all" = since the first publish)
const RANGES = { '24h': 24, '7d': 7 * 24, '30d': 30 * 24, all: null };
const RANGE_LABELS = { '24h': '24h', '7d': '7d', '30d': '30d', all: 'All time' };
const DEFAULT_RANGE = '7d';
// before / after an approval are compared over this many hours each
const COMPARE_HOURS = 24;

// checks the ?range= query value of the stats API. returns { range } (the default 7d when it is missing)
// or { error } when it is not one of the RANGES keys, so getStats can answer 400
function parseRange(range) {
  if (range === undefined) {
    return { range: DEFAULT_RANGE };
  }
  if (typeof range !== 'string' || !Object.hasOwn(RANGES, range)) {
    return { error: `range must be one of: ${Object.keys(RANGES).join(', ')}` };
  }
  return { range };
}

// the chart's step for a range from `from` to `to`
// returns 'hour', 'day' or 'month', picked so the chart never has more than about 750 points
function chooseStep(from, to) {
  const span = to.getTime() - from.getTime();
  if (span <= MAX_HOURLY_SPAN) {
    return 'hour';
  }
  return span <= MAX_DAILY_SPAN ? 'day' : 'month';
}

// one point per step from `from` up to and including `to`; `field` is the bucket's time field.
// buckets nobody viewed don't exist, so those points are 0
function fillSeries(buckets, field, from, to, stepMs) {
  const counts = new Map(buckets.map((bucket) => [bucket[field].getTime(), bucket.count]));
  const series = [];
  for (let t = from.getTime(); t <= to.getTime(); t += stepMs) {
    series.push({ time: new Date(t), count: counts.get(t) || 0 });
  }
  return series;
}

// turns hourly ViewStat buckets into one point per hour from `from` to `to` (missing hours are 0)
function hourlySeries(buckets, from, to) {
  return fillSeries(buckets, 'hour', from, to, HOUR_MS);
}

// turns DailyViewStat buckets into one point per day from `from` to `to` (missing days are 0)
function dailySeries(buckets, from, to) {
  return fillSeries(buckets, 'day', from, to, DAY_MS);
}

// the daily points added up per calendar month (UTC); a point's time is the 1st of its month
// used for ranges longer than 2 years, so the chart stays small. `daily` must be sorted by time
function monthlySeries(daily) {
  const series = [];
  daily.forEach((point) => {
    const month = new Date(Date.UTC(point.time.getUTCFullYear(), point.time.getUTCMonth(), 1));
    const last = series.at(-1);
    if (last && last.time.getTime() === month.getTime()) {
      last.count += point.count;
    } else {
      series.push({ time: month, count: point.count });
    }
  });
  return series;
}

// average views per point of a series, rounded to one decimal place; 0 for an empty series
function average(series) {
  if (series.length === 0) {
    return 0;
  }
  const total = series.reduce((sum, point) => sum + point.count, 0);
  return Math.round((total / series.length) * 10) / 10;
}

// for every approval: average views per hour in the 24 hours before and after it, and the change.
// the hour the approval happened in counts as "after". `hourly` must cover all the hours needed.
// `firstPublish` tells which approval was the first publish (it may be outside `approvals`)
// returns one object per approval: { at, first, before, after, change (percent), soFar }, which the
// Impact page shows under the chart next to each update marker
function summarizeUpdates(approvals, hourly, now, firstPublish) {
  if (approvals.length === 0) {
    return [];
  }
  const nowHour = ViewStat.startOfHour(now).getTime();
  const firstPublishHour = ViewStat.startOfHour(firstPublish).getTime();

  return approvals.map((at) => {
    const approvalHour = ViewStat.startOfHour(at).getTime();
    // the current hour is still filling up, so it is left out, unless it is the only hour after the approval
    const afterEnd = Math.min(approvalHour + COMPARE_HOURS * HOUR_MS, Math.max(nowHour, approvalHour + HOUR_MS));
    const after = average(hourly.filter((p) => p.time >= approvalHour && p.time < afterEnd));
    // fewer than 24 hours have passed since this approval
    const soFar = afterEnd - approvalHour < COMPARE_HOURS * HOUR_MS;

    // the first publish: nobody could see the article before it
    if (at.getTime() === firstPublish.getTime()) {
      return { at, first: true, before: null, after, change: null, soFar };
    }

    // nobody could see the article before its first publish, so those hours are not counted
    const beforeStart = Math.max(approvalHour - COMPARE_HOURS * HOUR_MS, firstPublishHour);
    const before = average(hourly.filter((p) => p.time >= beforeStart && p.time < approvalHour));
    // a change in percent means nothing when there were no views before
    const change = before > 0 ? Math.round(((after - before) / before) * 100) : null;
    return { at, first: false, before, after, change, soFar };
  });
}

// the same comparison for approvals older than the hourly retention, from the daily totals:
// the whole day before the approval's day against the whole day after it, divided by 24 so it is
// still views per hour. `daily` must cover those days
// returns objects in the same shape as summarizeUpdates, with daily: true so the page can say so
function summarizeDailyUpdates(approvals, daily, firstPublish) {
  if (approvals.length === 0) {
    return [];
  }
  const counts = new Map(daily.map((point) => [point.time.getTime(), point.count]));
  // views of one day (by its start time) divided by 24, rounded to one decimal place
  const perHour = (day) => Math.round(((counts.get(day) || 0) / 24) * 10) / 10;
  const firstPublishDay = DailyViewStat.startOfDay(firstPublish).getTime();

  return approvals.map((at) => {
    const day = DailyViewStat.startOfDay(at).getTime();
    const after = perHour(day + DAY_MS);
    // the first publish, or the day before was before the first publish: nothing to compare with
    if (at.getTime() === firstPublish.getTime() || day - DAY_MS < firstPublishDay) {
      const first = at.getTime() === firstPublish.getTime();
      return { at, first, before: null, after, change: null, soFar: false, daily: true };
    }
    const before = perHour(day - DAY_MS);
    const change = before > 0 ? Math.round(((after - before) / before) * 100) : null;
    return { at, first: false, before, after, change, soFar: false, daily: true };
  });
}

// GET /api/articles/:id/stats?range=24h|7d|30d|all (editor only)
// the Impact page calls it by Ajax (route in routes/articles.js, behind requireRole('editor')).
// validates the id and range, loads the article's approvals (publishHistory), reads the view buckets
// for the range and answers JSON { article, range, step, totalViews, points, updates }:
// the chart points plus a before / after summary for every approval marker in the range
async function getStats(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ error: 'Invalid article id' });
  }
  const { error, range } = parseRange(req.query.range);
  if (error) {
    return res.status(400).json({ error });
  }

  try {
    // only a published article has views; same rule as the /impact page and recordView
    const article = await Article.findOne({ _id: id, publishDate: { $ne: null } }).select('title draft.title publishHistory').lean();
    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }

    const now = new Date();
    const nowHour = ViewStat.startOfHour(now);
    const firstPublish = article.publishHistory[0] || null;
    // the hour the range starts at; "all" starts at the first publish
    let from;
    if (range === 'all') {
      from = firstPublish ? ViewStat.startOfHour(firstPublish) : nowHour;
    } else {
      from = new Date(nowHour.getTime() - (RANGES[range] - 1) * HOUR_MS);
    }
    const step = chooseStep(from, nowHour);
    // markers outside the range can't be drawn, so only these approvals are summarized
    const approvals = article.publishHistory.filter((at) => at >= from);
    // approvals whose 24 hours before are still in the hourly buckets get the exact comparison,
    // older ones the daily one. (in an hourly range every approval is recent)
    const hourlyKeptFrom = nowHour.getTime() - (ViewStat.RETENTION_DAYS - 1) * DAY_MS;
    // true when the 24 hours before this approval are still kept in the hourly buckets
    const isRecent = (at) => ViewStat.startOfHour(at).getTime() - COMPARE_HOURS * HOUR_MS >= hourlyKeptFrom;
    const recent = approvals.filter(isRecent);
    const old = approvals.filter((at) => !isRecent(at));

    // hourly buckets: the chart of an hourly range, and 24 hours before the earliest recent approval
    let hourly = [];
    const hourlyStarts = [];
    if (step === 'hour') {
      hourlyStarts.push(from.getTime());
    }
    if (recent.length > 0) {
      hourlyStarts.push(ViewStat.startOfHour(recent[0]).getTime() - COMPARE_HOURS * HOUR_MS);
    }
    if (hourlyStarts.length > 0) {
      const hourlyFrom = new Date(Math.min(...hourlyStarts));
      const buckets = await ViewStat.find({ article: id, hour: { $gte: hourlyFrom, $lte: nowHour } })
        .select('hour count')
        .lean();
      hourly = hourlySeries(buckets, hourlyFrom, nowHour);
    }

    // daily buckets: the chart of a longer range, plus the day before it for the oldest approval
    let daily = [];
    if (step !== 'hour') {
      const dailyFrom = new Date(DailyViewStat.startOfDay(from).getTime() - DAY_MS);
      const today = DailyViewStat.startOfDay(now);
      const buckets = await DailyViewStat.find({ article: id, day: { $gte: dailyFrom, $lte: today } })
        .select('day count')
        .lean();
      daily = dailySeries(buckets, dailyFrom, today);
    }

    const updates = [
      ...summarizeDailyUpdates(old, daily, firstPublish),
      ...summarizeUpdates(recent, hourly, now, firstPublish),
    ];
    // the approval's place in the whole history (0 = first publish, then update 1, 2, ...),
    // so the labels stay right when earlier approvals are outside the range
    const skipped = article.publishHistory.length - approvals.length;
    updates.forEach((update, index) => {
      update.number = skipped + index;
    });

    // the chart: one point per step of the range
    let points;
    if (step === 'hour') {
      points = hourly.filter((point) => point.time >= from);
    } else {
      const days = daily.filter((point) => point.time >= DailyViewStat.startOfDay(from));
      points = step === 'day' ? days : monthlySeries(days);
    }

    res.json({
      article: { _id: article._id, title: article.title || article.draft?.title || '(untitled)' },
      range,
      step,
      totalViews: points.reduce((sum, point) => sum + point.count, 0),
      points,
      updates,
    });
  } catch (err) {
    console.error('Failed to load article stats:', err);
    res.status(500).json({ error: 'Could not load the statistics' });
  }
}

// GET /impact, the Impact Analytics page. ?article=<id> opens it with that article selected
// the route is behind requireRole('editor') in app.js. renders views/impact.ejs (server side) with the
// range buttons; the chart data itself is loaded afterwards by Ajax from getStats.
// an unknown or unpublished ?article= id is ignored, and the page opens with nothing selected
async function showImpact(req, res, next) {
  try {
    const { article: id } = req.query;
    let selected = null;
    if (typeof id === 'string' && mongoose.isValidObjectId(id)) {
      const article = await Article.findOne({ _id: id, publishDate: { $ne: null } }).select('title').lean();
      if (article) {
        selected = { _id: article._id, title: article.title };
      }
    }
    res.render('impact', {
      title: 'Impact Analytics - The Daily Web',
      selected,
      ranges: Object.keys(RANGES),
      rangeLabels: RANGE_LABELS,
      defaultRange: DEFAULT_RANGE,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getStats,
  showImpact,
  parseRange,
  chooseStep,
  hourlySeries,
  dailySeries,
  monthlySeries,
  summarizeUpdates,
  summarizeDailyUpdates,
  RANGES,
  COMPARE_HOURS,
};
