# the-daily-web

College assignment - news website.

## Requirements

- Node.js 18 or newer
- MongoDB — either a local server or a MongoDB Atlas cluster

## Setup

```bash
./setup.sh
```

Checks your Node version, installs dependencies, and creates `.env` from
`.env.example`. Safe to re-run — it never overwrites an existing `.env`.

Then point `MONGO_URI` in `.env` at a database. Remember to include the database
name in the path, otherwise Mongoose silently uses one called `test`.

```bash
# local
MONGO_URI=mongodb://127.0.0.1:27017/the-daily-web

# Atlas
MONGO_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/the-daily-web
```

### Running MongoDB locally (Dev.)

The app needs a MongoDB connection to run at all (not just for comments) — copy `.env.example` to `.env` and fill in `MONGO_URI` before starting it.

Download the MongoDB Community Server archive for your platform/arch., extract into project folder, then:

```bash
mkdir -p .mongo-data
./mongodb-macos-*/bin/mongod --dbpath .mongo-data --port 27017
```

## Run

```bash
chmod +x ./setup.sh
./setup.sh
npm start
```

Then open http://localhost:PORT — the port comes from `PORT` in `.env`.

## Tests

```bash
npm test
```

Runs on Node's built-in test runner (`node --test`), no extra dependencies. Most tests are pure (model validation, request validation including the home feed query, rate-limit boundary) and always run; the one live rate-limit test that needs a real database skips itself automatically unless `MONGO_URI` is set.

## Project structure

```
the-daily-web/
├── app.js            # Express app setup (middleware, routes, error handling)
├── bin/www           # starts the HTTP server
├── setup.sh          # one-command development setup
├── .env.example      # template for .env (copy, then fill in)
├── config/           # db.js (Mongoose connection), categories.js (article categories)
├── controllers/      # request logic (e.g. homeController.js, articleController.js, commentController.js)
├── middleware/       # request helpers (e.g. viewedArticles.js)
├── models/           # Mongoose schemas (e.g. Article.js, Comment.js)
├── routes/           # URL → controller mapping
├── views/            # EJS templates, rendered on the server
│   └── partials/     # shared header / footer / sidebar / weather / comments widget
├── public/           # static files served as-is
│   ├── css/
│   └── js/           # vanilla client JS (e.g. feed.js, article.js, comments.js)
└── test/             # node:test test suites
```

## Features

### Home feed

The home page (`GET /`) is rendered on the server with the first 20 published articles already in the initial HTML, so search engines see the full content without running JavaScript. Each article card shows the title, image, summary, category, author, publish date and view count, and links to the article page.

On top of that first render, `public/js/feed.js` uses Ajax, without a full page reload, for:

- **Infinite scroll**: the next 20 articles load as the reader nears the bottom of the list.
- **Search** by title (case-insensitive), sent after a short typing delay instead of on every keystroke.
- **Category filter** and **viewed / not viewed filter**.
- **Sort** by publish date (newest first) or popularity (most views first).

The filter form is a normal `GET` form, and the server reads the same query string when it renders the page, so filtering also works with JavaScript turned off. The address bar is kept in sync with the current filters, so a refresh or a shared link shows the same results. If the query string on the home page is invalid, the default feed is shown instead of an error page.

**Viewed / not viewed**: guests have no account, so the ids of the articles they opened are kept in a `viewed` cookie (the most recent 100). The server sets it when an article page is rendered, and drops anything that is not a valid article id every time it reads it, since the browser controls the cookie.

`GET /api/articles` returns one page of the feed as JSON: `{ articles, page, hasMore }`. Only published articles are ever returned, and the list never includes the article body or unapproved edits.

| Parameter  | Allowed values                                  | Default           |
| ---------- | ----------------------------------------------- | ----------------- |
| `q`        | search text, up to 100 characters (trimmed)     | empty (no search) |
| `category` | one of the categories in `config/categories.js` | empty (all)       |
| `viewed`   | `viewed` or `unviewed`                          | empty (all)       |
| `sort`     | `date` or `popular`                             | `date`            |
| `page`     | whole number from 1 to 1000                     | `1`               |

An invalid parameter (unknown value, page out of range, a parameter sent as a list, such as `?q[]=x`) returns `400` with an error message.

### Article page

`GET /article/:id` is rendered fully on the server: title, author, category, publish date, main image and body. It shows only the approved version of the article (`content`), never an edit that is still waiting for approval. An invalid id, an unknown id, or an article that is not published gets the 404 page, so drafts and pending articles can't be reached by guessing the URL. The body is stored as plain text and printed paragraph by paragraph with HTML escaping.

The page includes the comments section (see below) and the sidebar, which holds the slot for the weather widget.

- `GET /api/articles/:id`: the same published article as JSON. Returns `400` for an invalid id and `404` if the article is not found or not published.
- `POST /api/articles/:id/view`: sent by `public/js/article.js` on every visit. It increases the article's view counter with MongoDB's atomic `$inc`, so many readers at once never lose a count. Returns `204`, or `404` if the article is not published.

### Comments

Every article page includes a comments section (list + add-comment form) that updates via Ajax, without a full page reload.

- `GET /api/articles/:articleId/comments` — list comments for an article, newest first.
- `POST /api/articles/:articleId/comments` — add a comment: `{ authorName, text }`. No login required.
- **Rate limiting**: a guest can post at most 3 comments per minute per IP address (`req.ip`), determined server-side so a client can't dodge it by claiming a different identity. Going over that returns `429` with an explanatory message — the request is never silently dropped and never crashes the server.
- Comment text is rendered client-side with `textContent` (never `innerHTML`) to prevent XSS.

The comments section now appears on every article page. The widget can still be previewed on its own at `/dev/comments-test`, a temporary route that is planned for removal.
