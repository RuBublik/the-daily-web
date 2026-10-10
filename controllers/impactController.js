// Impact Analytics: views of one article over time, and how they changed around each approval.
// Views are stored in hourly buckets (models/ViewStat.js).

const mongoose = require('mongoose');
const Article = require('../models/Article');
const ViewStat = require('../models/ViewStat');

const HOUR_MS = 60 * 60 * 1000;
// how far back each range button looks, in hours ("all" = since the first publish)
const RANGES = { '24h': 24, '7d': 7 * 24, '30d': 30 * 24, all: null };
const RANGE_LABELS = { '24h': '24h', '7d': '7d', '30d': '30d', all: 'All time' };
const DEFAULT_RANGE = '7d';
// before / after an approval are compared over this many hours each
const COMPARE_HOURS = 24;

function parseRange(range) {
  if (range === undefined) {
    return { range: DEFAULT_RANGE };
  }
  if (typeof range !== 'string' || !Object.hasOwn(RANGES, range)) {
    return { error: `range must be one of: ${Object.keys(RANGES).join(', ')}` };
  }
  return { range };
}

// one point per hour from `from` up to and including the hour of `to`; hours nobody viewed are 0
function hourlySeries(buckets, from, to) {
  const counts = new Map(buckets.map((bucket) => [bucket.hour.getTime(), bucket.count]));
  const series = [];
  for (let t = from.getTime(); t <= to.getTime(); t += HOUR_MS) {
    series.push({ time: new Date(t), count: counts.get(t) || 0 });
  }
  return series;
}

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
function summarizeUpdates(approvals, hourly, now, firstPublish) {
  const nowHour = ViewStat.startOfHour(now).getTime();

  return approvals.map((at) => {
    const approvalHour = ViewStat.startOfHour(at).getTime();
    const afterEnd = Math.min(approvalHour + COMPARE_HOURS * HOUR_MS, nowHour + HOUR_MS);
    const after = average(hourly.filter((p) => p.time >= approvalHour && p.time < afterEnd));
    // fewer than 24 hours have passed since this approval
    const soFar = afterEnd - approvalHour < COMPARE_HOURS * HOUR_MS;

    // the first publish: nobody could see the article before it
    if (at.getTime() === firstPublish.getTime()) {
      return { at, first: true, before: null, after, change: null, soFar };
    }

    const beforeStart = approvalHour - COMPARE_HOURS * HOUR_MS;
    const before = average(hourly.filter((p) => p.time >= beforeStart && p.time < approvalHour));
    // a change in percent means nothing when there were no views before
    const change = before > 0 ? Math.round(((after - before) / before) * 100) : null;
    return { at, first: false, before, after, change, soFar };
  });
}

// GET /api/articles/:id/stats?range=24h|7d|30d|all (editor only)
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
    const article = await Article.findById(id).select('title draft.title publishHistory').lean();
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
    // markers outside the range can't be drawn, so only these approvals are summarized
    const approvals = article.publishHistory.filter((at) => at >= from);

    // the comparison needs 24 hours before the earliest approval shown, which may be before the range
    const queryFrom = approvals.length > 0
      ? new Date(Math.min(from.getTime(), ViewStat.startOfHour(approvals[0]).getTime() - COMPARE_HOURS * HOUR_MS))
      : from;
    const buckets = await ViewStat.find({ article: id, hour: { $gte: queryFrom, $lte: nowHour } })
      .select('hour count')
      .lean();
    const hourly = hourlySeries(buckets, queryFrom, nowHour);

    const updates = approvals.length > 0 ? summarizeUpdates(approvals, hourly, now, firstPublish) : [];
    // the approval's place in the whole history (0 = first publish, then update 1, 2, ...),
    // so the labels stay right when earlier approvals are outside the range
    const skipped = article.publishHistory.length - approvals.length;
    updates.forEach((update, index) => {
      update.number = skipped + index;
    });

    // the chart: one point per hour of the range
    const points = hourly.filter((point) => point.time >= from);

    res.json({
      article: { _id: article._id, title: article.title || article.draft?.title || '(untitled)' },
      range,
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

module.exports = { getStats, showImpact, parseRange, hourlySeries, summarizeUpdates, RANGES, COMPARE_HOURS };
