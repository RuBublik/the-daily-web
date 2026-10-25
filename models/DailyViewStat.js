const mongoose = require('mongoose');

const DAY_MS = 24 * 60 * 60 * 1000;

// views of one article in one day. Hourly buckets (ViewStat) are deleted after 90 days, these are
// kept forever, so the chart of an article that is years old still has its whole history
const dailyViewStatSchema = new mongoose.Schema({
  article: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Article',
    required: true,
  },
  // start of the day, in UTC
  day: {
    type: Date,
    required: true,
  },
  count: {
    type: Number,
    default: 0,
    min: 0,
  },
});

// one bucket per article per day; also serves the chart query (one article, a time range)
dailyViewStatSchema.index({ article: 1, day: 1 }, { unique: true });

// the day bucket a moment falls into
// (midnight UTC of that day). exposed as DailyViewStat.startOfDay, used for recording and for the chart
function startOfDay(date) {
  return new Date(Math.floor(date.getTime() / DAY_MS) * DAY_MS);
}

dailyViewStatSchema.statics.startOfDay = startOfDay;

module.exports = mongoose.model('DailyViewStat', dailyViewStatSchema);
