require('dotenv').config({ quiet: true });

const createError = require('http-errors');
const express = require('express');
const path = require('path');
const logger = require('morgan');
const cookieParser = require('cookie-parser')
const authRoutes = require('./routes/authRoutes');
const impactRouter = require('./routes/impact');
const { resolveUser } = require('./middleware/authMiddleware')

const connectDB = require('./config/db');
const { requireRole } = require('./middleware/auth');

const indexRouter = require('./routes/index');
const commentsRouter = require('./routes/comments');
const articlesRouter = require('./routes/articles');
const editorRouter = require('./routes/editor');
const editorApiRouter = require('./routes/editorApi');
const reporterRouter = require('./routes/reporter');
const reporterApiRouter = require('./routes/reporterApi');
const weatherRouter = require('./routes/weather');

// Connect to MongoDB once at startup. If the connection fails the app cannot work at all,
// so we log the reason and stop the process instead of serving broken pages.
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
app.use('/vendor/chart.js', express.static(path.join(__dirname, 'node_modules/chart.js/dist')));

const COOKIE_NAME = process.env.COOKIE_NAME || 'token';

// Runs on every request, before any router: reads the JWT from the login cookie (or a Bearer header)
// through resolveUser and puts the logged-in user on req.user. It must come before the routers because
// requireRole and the controllers rely on req.user. A bad or expired token just clears the cookie and
// the request continues as a guest. res.locals.user lets every EJS view show the right header.
app.use(async (req, res, next) => {
  try {
    const user = await resolveUser(req);
    if (user) {
      req.user = user;
    }
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      res.clearCookie(COOKIE_NAME);
    } else {
      console.error('Database/Server error during auth check:', err.message);
    }
  }
  res.locals.user = req.user || null;
  // lets the header mark the current section's tab
  res.locals.currentPath = req.path;
  next();
});


// The routers. Role guards (requireRole) sit in front of the protected areas, so a router only runs
// after the server checked the user's role: /impact, /editor and /api/editor need an editor,
// /reporter and /api/my-articles need a reporter. Everything else is public.
app.use('/', indexRouter);
app.use('/impact', requireRole('editor'), impactRouter);
// comments first: the more specific path must be matched before /api/articles
app.use('/api/articles/:articleId/comments', commentsRouter);
app.use('/api/articles', articlesRouter);
app.use('/editor', requireRole('editor'), editorRouter);
app.use('/api/editor', requireRole('editor'), editorApiRouter);
app.use('/reporter', requireRole('reporter'), reporterRouter);
app.use('/api/my-articles', requireRole('reporter'), reporterApiRouter);
app.use('/api/weather', weatherRouter);
app.use('/auth', authRoutes);

// 404 handler: reached only when no router above matched the URL, so it must stay after all of them.
// It turns the request into a 404 error and passes it on to the error handlers below.
app.use(function(req, res, next) {
  next(createError(404));
});

// malformed JSON body on an API request -> JSON error, not the HTML error page
// It is mounted on /api only, so pages keep the normal error page. It must come before the general
// error handler, otherwise the HTML page would be sent first. Any other error is passed on with next(err).
app.use('/api', function(err, req, res, next) {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Malformed JSON in request body' });
  }
  next(err);
});

// error handler
// The last middleware: Express sends every error here (it has 4 arguments: err, req, res, next).
// It sets the HTTP status (500 if none), shows the error details only in development, logs the error
// otherwise, and renders views/error.ejs. So an error passed to next(err) ends here instead of crashing the server.
app.use(function(err, req, res, next) {
  const isDevelopment = process.env.NODE_ENV === 'development';

  res.locals.message = err.message;
  res.locals.error = isDevelopment ? err : {};

  if (!isDevelopment) {
    console.error(err);
  }

  res.status(err.status || 500);
  res.render('error', { title: 'Error' });
});

module.exports = app;
