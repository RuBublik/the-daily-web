require('dotenv').config({ quiet: true });

const createError = require('http-errors');
const express = require('express');
const path = require('path');
const jwt = require('jsonwebtoken');
const logger = require('morgan');
const cookieParser = require('cookie-parser')
const authRoutes = require('./src/routes/authRoutes');
const { User } = require('./src/models/user');


const connectDB = require('./src/config/db');

const indexRouter = require('./src/routes/index');

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
const JWT_SECRET = process.env.JWT_SECRET || 'secret';

app.use(async (req, res, next) => {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET);
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
app.use('/auth', authRoutes);

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
