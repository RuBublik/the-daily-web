# The Daily Web — Project Context

Repo: `the-daily-web` (https://github.com/RuBublik/the-daily-web/). Default branch: `master`.

This file gives any Claude Code session working in this repo the context needed to understand the assignment and keep the implementation consistent with it. It reflects the official course requirements document and the repo conventions already decided. When in doubt, favor the simplest implementation a student could build and explain by hand over a clever one.

## What this project is

A web-based news management/publishing system ("The Daily Web"), similar in spirit to a modern news site, built for a university web-development course final project. Three user types interact with it: Guest (unauthenticated reader), Reporter (creates/edits articles), Editor (approves/publishes/moderates).

## Allowed technology (hard constraint)

Only technologies taught in the course may be used:

- Server: Node.js + Express
- Data: MongoDB + Mongoose
- Views: EJS
- Client: Vanilla JavaScript only (including Ajax for async calls) — **no jQuery, React, Angular, Vue, or any other external UI framework/library**
- HTML5 with semantic tags, CSS with Flexbox
- REST principles for all API endpoints

Using an untaught framework or library is an explicit violation of the assignment rules, not just a style preference.

## Required architecture

- Strict **MVC** with a clear separation between Model, View, and Controller. Routes should stay thin and delegate to controllers; controllers hold logic; models are Mongoose schemas.
- All server responses to unauthorized actions or invalid data must be handled gracefully — never crash the server.
- All public pages (home feed and article page) must be **server-rendered with full content already in the initial HTML** (SEO requirement — search engines must see the content without running JS; never build page content with client-side JS). Interactive areas (search, filter, pagination, comments) update without a full page reload, via Ajax, on top of that initial server-rendered HTML.
- Responsive layout: desktop, tablet, and mobile.

Target folder layout — each folder is created together with its first real file (no empty folders / `.gitkeep` in git):

```
the-daily-web/
├── app.js
├── config/       # e.g. db.js (Mongoose connection)
├── models/       # User, Article, Comment, ViewStat (see Data models below)
├── controllers/
├── routes/
├── middleware/   # auth / role checks
├── views/
│   └── partials/ # header, footer, sidebar (weather widget lives here)
└── public/
    ├── css/
    ├── js/
    └── images/
```

## Data models (minimum four)

1. **Users** — reporters and editors (guests are unauthenticated, no user record needed for them). Username/password auth; passwords must be hashed, never stored or recoverable in plain text.
2. **Articles** — see workflow below for required fields (state, category, title, image, body, author, timestamps, current published version vs. pending version).
3. **Comments** — belong to an article; must support the comment rate limit below.
4. **View/analytics data** — records of article views over time, granular enough to drive the per-article views-over-time chart, including timestamps of when an editor approved/published an update to that article (so the graph can mark before/after behavior around each update). Design this to remain performant with thousands of articles and many concurrent readers — an approach that aggregates/buckets view events rather than storing every raw hit unbounded is worth considering.

Every model needs full CRUD (Create, Read/List/Search, Update, Delete), and search must work on at least one meaningful field (e.g. article title).

## Roles & permissions

- **Guest**: can only reach public areas — home feed and article pages, can post comments (rate-limited).
- **Reporter**: logs in, lands in their own workspace. Can create articles and edit only their own articles. **Cannot publish** — can only submit for editor approval.
- **Editor**: logs in, lands in the admin area. Can view/edit any article, approve and publish, return an article to the reporter for revision (with an explanatory note), and delete articles as needed.
- Permission checks must happen **server-side**, based on the authenticated identity — never trust client-side hiding of buttons/screens, and never derive role from anything the browser could tamper with.
- Sessions must survive a server restart — a logged-in user should not be forced to log in again just because the server restarted.

## Article workflow (state machine)

States: `draft`, `pending_review`, `published`, `returned_for_revision`.

Allowed transitions only:

- New article → created in `draft`.
- Reporter: `draft` → `pending_review` (their own article only).
- Editor: `pending_review` → `published`, or → `returned_for_revision` (must attach a note explaining what needs fixing).
- Reporter: `returned_for_revision` → `pending_review` (after making the requested edits).
- No other transition is permitted.

Editing an already-published article: the edit goes through the same approval flow as a new submission. The public continues to see the last **approved** version throughout — reporter edits-in-progress, and even a submitted-for-approval update, must never appear publicly until an editor approves them. No requirement to support concurrent multi-user editing of the same article — assume that doesn't happen.

Work continuity: while a reporter is writing/editing, their draft must persist continuously with **no explicit "Save" button** — closing the browser, refreshing, or switching machines must not lose work, and reopening the draft must resume the latest saved state.

## Home feed page (public)

- Shows only published, approved articles.
- The first 20 articles are rendered server-side in the initial HTML (EJS); infinite scroll, search, filter and sort use Ajax only to fetch results after that initial render.
- Infinite scroll: loads 20 more articles as the user nears the bottom.
- Search, category filter, viewed/unviewed filter, sort by publish date or popularity — all without a full page reload.
- Each article preview shows: title, image, excerpt, category, author, publish date.
- Clicking through leads to the full article page.

## Article page (public)

- Shows: title, author, category, publish date, main image, full body content.
- Comments section: list of existing comments + a form to add a new one. A newly added comment must appear immediately in the list without reloading the whole comment list.
- Every visit counts toward that article's view/analytics data.

## Comment rate limiting

A guest can post at most 3 comments per minute from the same device. Exceeding this must be blocked server-side with an appropriate error message returned to the user — never silently dropped, never a server crash.

## Analytics / "Impact" chart (editor area)

Per selected article, a views-over-time chart (Chart.js or `<canvas>`) showing:

- A time axis and view counts along it.
- Clear markers for each time the editor approved/published an update to that article.
- Enough information to visually compare view behavior before vs. after an update (e.g., an update at 14:00 should let you see the view pattern shift around that point).

Assume the site may serve thousands of concurrent readers — the collection/storage/aggregation strategy for view data needs to hold up at that scale, not just work for a handful of test hits.

## External integration: weather widget

Sidebar widget showing current weather, using a well-known free external weather API (e.g. OpenWeatherMap or equivalent) via a route that doesn't require entering credit card details. Displayed data can lag up to 15 minutes behind real time.

## Non-functional requirements

- Handle errors, edge cases, and invalid input on both client and server; unauthorized actions or bad data must never crash the server.
- Search, filter, and sort must always return correct results.
- The system must stay fast and usable with a database containing thousands of articles.
- Log errors and significant operational events server-side.

## Demo data (must exist before the defense)

- At least 500 articles spanning different states and categories.
- Several reporter users and one editor user.
- Comments on articles.
- Articles in each state: in-progress (draft), pending approval, published — including at least a few published articles that have gone through multiple post-publish updates.
- Enough historical view data, spread over time, to meaningfully render the Impact chart and its update markers.
- The demo must also be able to show: permission enforcement across roles, work continuity, correct behavior after a server restart, search/pagination over the full dataset, comment rate-limiting, and the weather widget.

## Git & collaboration workflow

- Default branch is `master` (already renamed; not `main`).
- Branch protection plan for `master`: PR required before merging (no direct pushes once teammates are onboarded), at least 1 approving review, conversation resolution required before merge, force-push and branch deletion blocked. Squash merge only — one clean commit per PR on `master`.
- Repo stays **public** (course requires the Git link to be open for viewing).
- `.gitignore` must exclude `node_modules/`, `.env`, and editor/tool-local folders (`.vscode/`, `.idea/`, `.cursor/`, `.claude/`) from the very first commit.
- **Never commit secrets** — no passwords, API keys, or tokens in the repository, in any commit.
- Frequent, well-documented commits; real use of branches, merges, and pull requests — this collaborative history is itself part of what's graded and must be presentable at the defense.
- Every student must be able to explain any part of the codebase at the defense, not just the parts they personally wrote — so prefer straightforward, readable implementations over clever ones.

## Documentation requirement

The submitted README must include: installation/run instructions, the project's folder/file structure, and a short description of the implemented functionality and features.

## Coding conventions

- `const`/`let` over `var`.
- No jQuery or other unlisted client-side libraries — vanilla JS only, per the allowed-technology constraint above.
