# OCR Service

A web-based OCR (Optical Character Recognition) service. Its main feature is pulling text off Instagram carousel posts (screenshots of quotes, threads, recipes, etc.); it can also OCR images you upload directly.

## Features

- **Instagram carousel extractor** — paste a post URL, it scrapes every slide and OCRs the text (or download the raw slide images as a zip)
- **Image upload** — drag & drop up to 20 images (JPEG, PNG, WebP, GIF) for OCR
- Tesseract OCR with multi-language support (default: Italian + English)
- Clean web UI: copy extracted text to the clipboard, or download it as a Markdown file
- **Instagram comments exporter (CLI)** — dumps every comment and reply thread of a post to Markdown; re-running fetches only what's new

## Requirements

- Node.js 18+ and Yarn, **or** Docker

## Setup

**1. Install dependencies**

```bash
yarn install
```

**2. Configure environment**

```bash
cp .env.example .env
```

Edit `.env` with your settings (see [Configuration](#configuration)).

**3. Start the server**

```bash
# Development (watch mode)
yarn dev

# Production
yarn build && yarn start
```

The server runs on `http://localhost:3089` by default.

## Docker

```bash
cp .env.example .env
# edit .env — at minimum set INSTAGRAM_SESSION_ID
docker compose up --build
```

The app will be available at `http://localhost:3089`.

**Without Compose:**

```bash
docker build -t ocr-service .
docker run -p 3089:3089 --env-file .env ocr-service
```

## Configuration

All options are set via environment variables in `.env`:

| Variable                    | Default    | Description                                                                                                                            |
|-----------------------------|------------|------------------------------------------------------------------------------------------------------------------------------------------|
| `PORT`                      | `3089`     | Server port                                                                                                                            |
| `TESSERACT_LANG`            | `ita+eng`  | OCR language(s). Combine with `+` (e.g. `ita+eng+fra`). See [available languages](https://tesseract-ocr.github.io/tessdoc/Data-Files). |
| `OCR_CONFIDENCE_THRESHOLD`  | `40`       | Lines with a Tesseract confidence below this (0–100) are dropped as noise.                                                            |
| `INSTAGRAM_SESSION_ID`      | —          | Your logged-in Instagram `sessionid` cookie. Required for the carousel extractor.                                                     |

### Adding Tesseract language models

The repo includes `eng.traineddata` and `ita.traineddata`. To add more languages, download the corresponding `.traineddata` file from the [Tesseract tessdata repository](https://github.com/tesseract-ocr/tessdata) and place it in the project root.

### Getting an Instagram session cookie

1. Log in to instagram.com in Chrome.
2. DevTools → Application → Cookies → `https://www.instagram.com` → copy the `sessionid` value.
3. Set `INSTAGRAM_SESSION_ID` in `.env`.

Session cookies expire periodically — if the extractor starts returning a 401 auth error, grab a fresh one.

## Instagram comments exporter

A standalone CLI (no browser, no server) that saves all comments and reply threads of a post as Markdown. It uses the same `INSTAGRAM_SESSION_ID` from `.env`. Instagram doesn't serve comments to logged-out requests.

```bash
yarn ig-comments https://www.instagram.com/p/<shortcode>/
yarn ig-comments <url> --out some/dir   # default: output/comments
yarn ig-comments <url> --full           # force a full rescan (see below)
yarn ig-comments <url> --tz UTC         # timestamp timezone (default: Europe/Rome, shown as CET/CEST)
```

It writes two files per post:

- `<shortcode>.md`: the post caption, then each thread in chronological order with `@username`, date and likes, and replies nested underneath. Comments fetched in the latest run are marked `[N]`. Saved comments that later disappear stay in the file and are marked `[D]` "no longer found". That can mean deleted, hidden by the owner or a filter, or the author deactivated their account or restricted you. The mark clears if the comment comes back.
- `<shortcode>.json`: the stored comments plus per-thread reply counts. Keep it: later runs read it and only fetch what's new.

How incremental runs work: top-level comments are fetched newest first, and a thread's replies are re-fetched only when its reply count has changed. For posts with ≤500 comments, every run rescans all top-level comments, which is cheap and catches new replies under old comments. For larger posts, a run stops at the first page with nothing new. New replies under older comments are then only picked up with `--full`. The same goes for spotting removed top-level comments. Removed replies are caught whenever their thread's reply count drops.

Instagram's displayed comment count usually exceeds what the export holds. The count includes comments it hides from the API (spam-filtered or restricted accounts).

## API

### `POST /extract-instagram`

Scrapes an Instagram carousel post and OCRs each slide.

**Request** (JSON): `{ "url": "https://www.instagram.com/p/...", "title": "optional note title" }`

**Response**:

```json
{
  "title": "My note",
  "text": "Flattened Markdown text of all slides",
  "sections": [{ "source": "slide-1.jpg", "text": "..." }]
}
```

### `POST /download-instagram`

Same scraping step, but returns the raw slide images as a `.zip` instead of running OCR.

**Request** (JSON): `{ "url": "https://www.instagram.com/p/..." }`

### `POST /extract`

OCRs uploaded images.

**Request** (multipart/form-data):

| Field    | Type              | Description                                |
|----------|-------------------|--------------------------------------------|
| `images` | File[]            | Images to process (max 20, max 20 MB each) |
| `title`  | string (optional) | Note title. Defaults to `OCR – {date}`     |

**Response**: same shape as `/extract-instagram`.

## Deploying

This app runs a persistent Node/Express server and drives a headless Chromium via Playwright to scrape Instagram — that rules out plain serverless platforms (Netlify, Vercel functions), which don't support long-running processes or the Chromium binary. The included `Dockerfile` is built for a normal container host instead.

### Render (recommended)

The repo includes a `render.yaml` blueprint:

1. Push this repo to GitHub.
2. In Render, **New → Blueprint**, point it at the repo — it will pick up `render.yaml` and build from the `Dockerfile`.
3. Set the `INSTAGRAM_SESSION_ID` secret in the Render dashboard (the blueprint leaves it unset on purpose).
4. Deploy. The free plan spins the service down after inactivity and wakes it back up on the next request — fine for occasional personal use; upgrade to a paid plan if you want it always warm.

### Fly.io

Also works from the same `Dockerfile`:

```bash
fly launch --no-deploy   # generates fly.toml, don't let it override the Dockerfile
fly secrets set INSTAGRAM_SESSION_ID=...
fly deploy
```

## Project Structure

```
ocr-service/
├── src/
│   ├── server.ts          # Express server and API routes
│   ├── ocr.ts              # Tesseract OCR wrapper
│   ├── instagram.ts        # Playwright-based Instagram carousel scraper
│   ├── instagram-comments.ts # Instagram comments fetcher + Markdown renderer
│   ├── cli/
│   │   └── instagram-comments.ts # `yarn ig-comments` entry point
│   └── public/
│       ├── index.html      # Instagram extractor (main page)
│       ├── upload.html     # Image upload page
│       ├── style.css       # Styles
│       ├── results.js      # Shared result rendering / copy / download
│       ├── instagram.js    # Instagram page logic
│       └── app.js          # Upload page logic
├── tmp/                    # Temporary scrape/upload directory
├── eng.traineddata         # Tesseract English language model
├── ita.traineddata         # Tesseract Italian language model
├── .env.example            # Environment variable template
├── Dockerfile
├── docker-compose.yml
├── render.yaml
└── tsconfig.json
```

## Scripts

| Command      | Description                                     |
|--------------|-------------------------------------------------|
| `yarn dev`   | Start in watch mode (TypeScript, no build step) |
| `yarn build` | Compile TypeScript to `dist/`                   |
| `yarn start` | Run compiled production build                   |
| `yarn ig-comments <url>` | Export/update a post's comments as Markdown |
