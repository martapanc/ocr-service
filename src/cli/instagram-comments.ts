import "dotenv/config";
import path from "path";
import { DEFAULT_TIME_ZONE, syncComments } from "../instagram-comments.js";

const USAGE = `Usage: yarn ig-comments <instagram-post-url> [--out <dir>] [--tz <zone>] [--full]

Downloads all comments and reply threads of a post into <dir>/<shortcode>.md
(plus <shortcode>.json, the state used to fetch only new comments on later runs).

  --out <dir>   output directory (default: output/comments)
  --tz <zone>   IANA timezone for timestamps, e.g. UTC (default: Europe/Rome)
  --full        rescan every top-level comment, to catch new replies under old
                comments on large posts (always done for posts with ≤500 comments)`;

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
    console.log(USAGE);
    process.exit(args.length === 0 ? 1 : 0);
  }

  const outIdx = args.indexOf("--out");
  const tzIdx = args.indexOf("--tz");
  const outDir = outIdx >= 0 ? args[outIdx + 1] : path.join("output", "comments");
  const timeZone = tzIdx >= 0 ? args[tzIdx + 1] : DEFAULT_TIME_ZONE;
  const optionValues = new Set([outIdx + 1, tzIdx + 1].filter((i) => i > 0));
  const url = args.find((a, i) => !a.startsWith("--") && !optionValues.has(i));
  if (!url || !outDir || !timeZone) {
    console.error(USAGE);
    process.exit(1);
  }

  try {
    new Intl.DateTimeFormat("en-GB", { timeZone });
  } catch {
    console.error(`Unknown timezone "${timeZone}" — use an IANA name like Europe/Rome or UTC`);
    process.exit(1);
  }

  const sessionId = process.env.INSTAGRAM_SESSION_ID;
  if (!sessionId) {
    console.error("INSTAGRAM_SESSION_ID is not set (see README → Getting an Instagram session cookie)");
    process.exit(1);
  }

  const result = await syncComments(url, {
    outDir,
    sessionId,
    full: args.includes("--full"),
    timeZone,
    log: (msg) => console.log(msg),
  });

  const missing = result.missing ? `, ${result.missing} no longer found` : "";
  console.log(`\n${result.added} new comment(s)${missing}, ${result.total} total`);
  console.log(`Markdown: ${result.mdPath}`);
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
