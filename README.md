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

Runs on Node's built-in test runner (`node --test`), no extra dependencies. Most tests are pure (model validation, request validation, rate-limit boundary) and always run; the live tests that need a real database (comment rate limit, editor approve/return flow) skip themselves automatically unless `MONGO_URI` is set, e.g. `MONGO_URI=mongodb://127.0.0.1:27017/the-daily-web npm test`.

## Project structure

```
the-daily-web/
├── app.js            # Express app setup (middleware, routes, error handling)
├── bin/www           # starts the HTTP server
├── setup.sh          # one-command development setup
├── .env.example      # template for .env (copy, then fill in)
├── config/           # db.js — Mongoose connection
├── middleware/       # auth.js — requireAuth / requireRole
├── controllers/      # request logic (e.g. homeController.js, commentController.js)
├── models/           # Mongoose schemas (e.g. Comment.js)
├── routes/           # URL → controller mapping
├── views/            # EJS templates, rendered on the server
│   └── partials/     # shared header / footer / comments widget
├── public/           # static files served as-is
│   ├── css/
│   └── js/           # vanilla client JS (e.g. comments.js)
└── test/             # node:test test suites
```

## Features

### Comments

Every article page includes a comments section (list + add-comment form) that updates via Ajax, without a full page reload.

- `GET /api/articles/:articleId/comments` — list comments for an article, newest first.
- `POST /api/articles/:articleId/comments` — add a comment: `{ authorName, text }`. No login required.
- **Rate limiting**: a guest can post at most 3 comments per minute per IP address (`req.ip`), determined server-side so a client can't dodge it by claiming a different identity. Going over that returns `429` with an explanatory message — the request is never silently dropped and never crashes the server.
- Comment text is rendered client-side with `textContent` (never `innerHTML`) to prevent XSS.

Until the real article page (home feed / article view) exists, the widget can be previewed on its own at `/dev/comments-test` — a temporary route that will be removed once it's wired into the real page.

### Editor area

Only for users with the `editor` role. Every page and API route is mounted behind `requireRole('editor')` (`middleware/auth.js`), so the check happens on the server for every request. A reporter gets `403`, a guest `401`.

- `GET /editor`: all articles, newest change first. Shows the ones waiting for review (`pending`) by default, with a status filter and a title search. The first page is rendered on the server. Filtering, searching and "Load more" use Ajax (`public/js/editor.js`, `GET /api/editor/articles?status=&q=&page=`).
- `GET /editor/articles/:id`: the review page. Shows the submitted version, and for an update to a published article the live version next to it, so the editor sees what readers see now and what would replace it.

Actions on a pending article (`public/js/editorArticle.js`):

- **Approve and publish** (`POST /api/editor/articles/:id/approve`): the draft becomes the live version. The first approval sets `publishDate`, and every approval is added to `publishHistory`, which the Impact chart uses to mark updates.
- **Return for revision** (`POST /api/editor/articles/:id/return`, `{ note }`): a note explaining what to fix is required. The draft stays for the reporter, and a published article stays public with its last approved version.
- **Edit** (`PATCH /api/editor/articles/:id`): the editor edits the pending version directly. Only the version fields (title, summary, image, category, content) are accepted.
- **Delete** (`DELETE /api/editor/articles/:id`, any status): removes the article and its comments.

Every status change goes through `Article.canTransition(from, to, role)` (`models/Article.js`), the article workflow in one place. Approve and return only update an article that is still pending, so a double click acts once. Invalid ids, bad input and forbidden transitions get a `400` / `404` JSON error, never a crash. Approve, return and delete are logged on the server with the editor's username.

**Until the real login is merged:** set `DEV_AS=editor` in `.env` and restart the server to browse the editor area as a development editor (ignored when `NODE_ENV=production`).
