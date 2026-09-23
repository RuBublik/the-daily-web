require('dotenv').config({ quiet: true });

const createError = require('http-errors');
const express = require('express');
const path = require('path');
const logger = require('morgan');
const connectDB = require('./config/db');

const indexRouter = require('./routes/index');
const commentsRouter = require('./routes/comments');
const devTestRouter = require('./routes/devTest');

connectDB().catch((err) => {
  console.error('Could not connect to MongoDB:', err.message);
  process.exit(1);
});

const app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/api/articles/:articleId/comments', commentsRouter);
app.use('/dev', devTestRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error', { title: 'Error' });
});

module.exports = app;
