# OCR Service

A web-based OCR (Optical Character Recognition) service that extracts text from images and saves results to multiple destinations: local Markdown files, Notion, and Apple Notes.

## Features

- Upload up to 20 images at once (JPEG, PNG, WebP, GIF)
- Extract text using Tesseract OCR with multi-language support (default: Italian + English)
- Save extracted text to:
  - **Local files** — timestamped Markdown files
  - **Notion** — creates pages in a Notion database
  - **Apple Notes** — macOS only, via AppleScript
- Clean web UI with drag-and-drop, image previews, and copy-to-clipboard

## Requirements

- Node.js 18+ and Yarn, **or** Docker

> **Note:** Apple Notes integration is macOS-only and not available inside Docker.

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

**1. Configure environment**

```bash
cp .env.example .env
# edit .env with your NOTION_TOKEN etc.
```

**2. Build and run**

```bash
docker compose up --build
```

The app will be available at `http://localhost:3089`. The `output/` directory is mounted as a volume so extracted Markdown files persist on the host. All variables from `.env` are passed into the container automatically via `env_file`.

**Without Compose:**

```bash
docker build -t ocr-service .
docker run -p 3089:3089 --env-file .env -v $(pwd)/output:/app/output ocr-service
```

**Stopping:**

```bash
docker compose down
```

> Apple Notes output requires macOS + AppleScript and is not supported inside Docker.

## Configuration

All options are set via environment variables in `.env`:

| Variable             | Default    | Description                                                                                                                            |
|----------------------|------------|----------------------------------------------------------------------------------------------------------------------------------------|
| `PORT`               | `3089`     | Server port                                                                                                                            |
| `TESSERACT_LANG`     | `ita+eng`  | OCR language(s). Combine with `+` (e.g. `ita+eng+fra`). See [available languages](https://tesseract-ocr.github.io/tessdoc/Data-Files). |
| `OUTPUT_DIR`         | `./output` | Directory for local Markdown output files                                                                                              |
| `NOTION_TOKEN`       | —          | Notion integration token (from [notion.so/my-integrations](https://www.notion.so/my-integrations))                                     |
| `NOTION_DATABASE_ID` | —          | ID of the target Notion database                                                                                                       |

### Adding Tesseract language models

The repo includes `eng.traineddata` and `ita.traineddata`. To add more languages, download the corresponding `.traineddata` file from the [Tesseract tessdata repository](https://github.com/tesseract-ocr/tessdata) and place it in the project root.

### Notion setup

1. Create a Notion integration at [notion.so/my-integrations](https://www.notion.so/my-integrations) and copy the token.
2. Share the target database with your integration.
3. Copy the database ID from its URL: `notion.so/{workspace}/{DATABASE_ID}?v=...`
4. Set `NOTION_TOKEN` and `NOTION_DATABASE_ID` in `.env`.

The database must have a property named **Name** (title type).

## API

### `POST /extract`

Extracts text from uploaded images and saves to the selected destinations.

**Request** (multipart/form-data):

| Field     | Type               | Description                                |
|-----------|--------------------|--------------------------------------------|
| `images`  | File[]             | Images to process (max 20, max 20 MB each) |
| `title`   | string (optional)  | Note title. Defaults to `OCR – {date}`     |
| `outputs` | string \| string[] | Destinations: `file`, `notion`, `notes`    |

**Response** (JSON):

```json
{
  "title": "My note",
  "text": "Extracted text content...",
  "results": {
    "filePath": "/path/to/output/2024-01-01T12-00-00-my-note.md",
    "notion": "ok",
    "notes": "ok"
  },
  "errors": {
    "file": null,
    "notion": null,
    "notes": null
  }
}
```

## Project Structure

```
ocr-service/
├── src/
│   ├── server.ts          # Express server and API routes
│   ├── ocr.ts             # Tesseract OCR wrapper
│   ├── public/
│   │   ├── index.html     # Markup
│   │   ├── style.css      # Styles
│   │   └── app.js         # UI logic
│   └── outputs/
│       ├── file.ts        # Local Markdown output
│       ├── notion.ts      # Notion API output
│       └── notes.ts       # Apple Notes output (macOS)
├── output/                # Default local output directory
├── tmp/                   # Temporary upload directory
├── eng.traineddata        # Tesseract English language model
├── ita.traineddata        # Tesseract Italian language model
├── .env.example           # Environment variable template
├── Dockerfile
├── docker-compose.yml
└── tsconfig.json
```

## Scripts

| Command      | Description                                     |
|--------------|-------------------------------------------------|
| `yarn dev`   | Start in watch mode (TypeScript, no build step) |
| `yarn build` | Compile TypeScript to `dist/`                   |
| `yarn start` | Run compiled production build                   |