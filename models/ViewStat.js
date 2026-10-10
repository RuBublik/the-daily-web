const mongoose = require('mongoose');

const HOUR_MS = 60 * 60 * 1000;
const DUPLICATE_KEY_ERROR_CODE = 11000;

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

// the hour bucket a moment falls into
function startOfHour(date) {
  return new Date(Math.floor(date.getTime() / HOUR_MS) * HOUR_MS);
}

// counts one view. $inc is atomic, so concurrent views never lose a count, and upsert
// creates the hour's bucket on its first view
async function record(articleId, at = new Date()) {
  const filter = { article: articleId, hour: startOfHour(at) };
  const update = { $inc: { count: 1 } };
  try {
    await this.updateOne(filter, update, { upsert: true });
  } catch (err) {
    // two first views of the same hour at once can both try to create the bucket, and the unique
    // index rejects the second. Retry once if err is duplicate.
    if (err.code !== DUPLICATE_KEY_ERROR_CODE) {
      throw err;
    }
    await this.updateOne(filter, update);
  }
}

viewStatSchema.statics.startOfHour = startOfHour;
viewStatSchema.statics.record = record;

module.exports = mongoose.model('ViewStat', viewStatSchema);
