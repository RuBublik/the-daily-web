require('dotenv').config({ quiet: true });

const createError = require('http-errors');
const express = require('express');
const path = require('path');
const jwt = require('jsonwebtoken');
const logger = require('morgan');
const cookieParser = require('cookie-parser')
const authRoutes = require('./routes/authRoutes');
const { User } = require('./models/user');
const {getJwtSecret}=require('./middleware/authMiddleware')

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
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

const COOKIE_NAME = process.env.COOKIE_NAME || 'token';

app.use(async (req, res, next) => {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (token) {
      const decoded = jwt.verify(token, getJwtSecret());
      const user = await User.findById(decoded.id).select('-passwordHash').lean();
      if (user) {
        req.user = user;
      }
    }
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      res.clearCookie(COOKIE_NAME);
    } else {
      console.error('Database/Server error during auth check:', err.message);
    }
  }
  res.locals.user = req.user || null;
  next();
});


app.use('/', indexRouter);
app.use('/api/articles/:articleId/comments', commentsRouter);
app.use('/dev', devTestRouter);
app.use('/auth', authRoutes);

app.use(function(req, res, next) {
  next(createError(404));
});

// malformed JSON body on an API request -> JSON error, not the HTML error page
app.use('/api', function(err, req, res, next) {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Malformed JSON in request body' });
  }
  next(err);
});

// error handler
app.use(function(err, req, res, next) {
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  res.status(err.status || 500);
  res.render('error', { title: 'Error' });
});

module.exports = app;
