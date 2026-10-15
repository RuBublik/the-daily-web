const mongoose = require('mongoose');
const DailyViewStat = require('./DailyViewStat');

const HOUR_MS = 60 * 60 * 1000;
const DUPLICATE_KEY_ERROR_CODE = 11000;
// hourly buckets older than this are deleted by MongoDB; the daily totals stay
const RETENTION_DAYS = 90;

// views of one article in one hour. aggregating on write (one document per article per hour,
// not one per view) keeps the collection small and the chart fast, even with thousands of readers
const viewStatSchema = new mongoose.Schema({
  article: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Article',
    required: true,
  },
  // start of the hour, in UTC
  hour: {
    type: Date,
    required: true,
  },
  count: {
    type: Number,
    default: 0,
    min: 0,
  },
});

// one bucket per article per hour; also serves the chart query (one article, a time range)
viewStatSchema.index({ article: 1, hour: 1 }, { unique: true });
// TTL index: MongoDB deletes a bucket once its hour is older than RETENTION_DAYS
viewStatSchema.index({ hour: 1 }, { expireAfterSeconds: RETENTION_DAYS * 24 * 60 * 60 });

// the hour bucket a moment falls into
function startOfHour(date) {
  return new Date(Math.floor(date.getTime() / HOUR_MS) * HOUR_MS);
}

// adds one to the bucket `filter` points at. $inc is atomic, so concurrent views never lose a count,
// and upsert creates the bucket on its first view
async function upsertCount(Model, filter) {
  const update = { $inc: { count: 1 } };
  try {
    await Model.updateOne(filter, update, { upsert: true });
  } catch (err) {
    // two first views of the same bucket at once can both try to create it, and the unique
    // index rejects the second. Retry once if err is duplicate.
    if (err.code !== DUPLICATE_KEY_ERROR_CODE) {
      throw err;
    }
    await Model.updateOne(filter, update);
  }
}

// counts one view, in its hour bucket and in its day bucket (independent, so both at once)
async function record(articleId, at = new Date()) {
  await Promise.all([
    upsertCount(this, { article: articleId, hour: startOfHour(at) }),
    upsertCount(DailyViewStat, { article: articleId, day: DailyViewStat.startOfDay(at) }),
  ]);
}

viewStatSchema.statics.startOfHour = startOfHour;
viewStatSchema.statics.record = record;
viewStatSchema.statics.RETENTION_DAYS = RETENTION_DAYS;

module.exports = mongoose.model('ViewStat', viewStatSchema);
