import fs from "fs";
import path from "path";

// Instagram's web app ID — required by the private web API.
const IG_APP_ID = "936619743392459";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const SHORTCODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
// Posts with up to this many comments get a full top-level rescan on every run,
// so new replies under old comments are picked up too. Above it, incremental runs
// stop at the first page of already-known comments (use `full` to force a rescan).
const FULL_SCAN_THRESHOLD = 500;
const REQUEST_DELAY_MS = 400;
const MAX_RETRIES = 4;
export const DEFAULT_TIME_ZONE = "Europe/Rome";

export interface StoredComment {
  id: string;
  parentId: string | null;
  username: string;
  fullName: string;
  text: string;
  createdAt: number; // unix seconds
  likes: number;
  firstSeenAt: string; // ISO timestamp of the run that first fetched it
  // ISO timestamp of the first run that no longer found it (deleted, hidden, or its author
  // deactivated/restricted). Cleared if it shows up again.
  missingSince?: string;
}

export interface CommentStore {
  shortcode: string;
  mediaId: string;
  postUrl: string;
  owner: string | null;
  caption: string | null;
  // Set once a run has walked every top-level page — until then, runs keep crawling to the end.
  initialCrawlComplete: boolean;
  lastRunAt: string | null;
  comments: Record<string, StoredComment>;
  // Last child_comment_count reported per top-level comment; a change triggers a reply refetch.
  replyCounts: Record<string, number>;
}

export interface SyncOptions {
  outDir: string;
  sessionId: string;
  full?: boolean;
  timeZone?: string; // IANA zone for displayed timestamps (default Europe/Rome)
  log?: (msg: string) => void;
}

export interface SyncResult {
  jsonPath: string;
  mdPath: string;
  total: number;
  added: number;
  missing: number; // comments newly not found this run
}

/* eslint-disable @typescript-eslint/no-explicit-any */

export function parseShortcode(postUrl: string): string {
  const m = postUrl.match(/instagram\.com\/(?:[^/]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
  if (!m) throw new Error(`Not a valid Instagram post URL: ${postUrl}`);
  return m[1];
}

export function shortcodeToMediaId(shortcode: string): string {
  // Private-post shortcodes carry a suffix past 11 chars; only the first 11 encode the ID.
  return [...shortcode.slice(0, 11)]
    .reduce((n, c) => n * 64n + BigInt(SHORTCODE_ALPHABET.indexOf(c)), 0n)
    .toString();
}

export async function syncComments(postUrl: string, opts: SyncOptions): Promise<SyncResult> {
  const log = opts.log ?? (() => {});
  const shortcode = parseShortcode(postUrl);
  const mediaId = shortcodeToMediaId(shortcode);
  const jsonPath = path.join(opts.outDir, `${shortcode}.json`);
  const mdPath = path.join(opts.outDir, `${shortcode}.md`);

  const store: CommentStore = fs.existsSync(jsonPath)
    ? JSON.parse(fs.readFileSync(jsonPath, "utf8"))
    : {
        shortcode,
        mediaId,
        postUrl: `https://www.instagram.com/p/${shortcode}/`,
        owner: null,
        caption: null,
        initialCrawlComplete: false,
        lastRunAt: null,
        comments: {},
        replyCounts: {},
      };

  const runAt = new Date().toISOString();
  const api = (url: string) => igGet(url, opts.sessionId, log);
  let added = 0;
  let missing = 0;
  const seen = new Set<string>();

  const markMissing = (c: StoredComment) => {
    if (c.missingSince) return;
    c.missingSince = runAt;
    missing++;
  };

  const addComment = (c: any, parentId: string | null) => {
    seen.add(String(c.pk));
    const existing = store.comments[c.pk];
    if (existing) {
      existing.likes = c.comment_like_count ?? existing.likes;
      delete existing.missingSince;
      return false;
    }
    store.comments[c.pk] = {
      id: String(c.pk),
      parentId,
      username: c.user?.username ?? "unknown",
      fullName: c.user?.full_name ?? "",
      text: c.text ?? "",
      createdAt: c.created_at,
      likes: c.comment_like_count ?? 0,
      firstSeenAt: runAt,
    };
    added++;
    return true;
  };

  // --- Top-level comments, newest first ---
  let cursor: string | null = null;
  let page = 0;
  let fullScan = opts.full || !store.initialCrawlComplete;
  let walkedAll = false;
  const threadsToRefresh: string[] = [];

  for (;;) {
    const qs = new URLSearchParams({ can_support_threading: "true", sort_order: "recent" });
    if (cursor) qs.set("min_id", cursor);
    const data = await api(`/api/v1/media/${mediaId}/comments/?${qs}`);
    page++;

    if (page === 1) {
      if (data.caption) {
        store.owner = data.caption.user?.username ?? store.owner;
        store.caption = data.caption.text ?? store.caption;
      }
      if (!fullScan && (data.comment_count ?? 0) <= FULL_SCAN_THRESHOLD) fullScan = true;
      log(`Post has ${data.comment_count ?? "?"} comments (incl. replies); ${fullScan ? "full" : "incremental"} scan`);
    }

    const comments: any[] = data.comments ?? [];
    let newOnPage = 0;
    for (const c of comments) {
      // A comment that reappears gets its thread refetched so its replies are reconciled too.
      const wasMissing = !!store.comments[c.pk]?.missingSince;
      if (addComment(c, null)) newOnPage++;
      const replyCount = c.child_comment_count ?? 0;
      if (replyCount > 0 && (wasMissing || store.replyCounts[c.pk] !== replyCount)) threadsToRefresh.push(String(c.pk));
    }
    log(`  page ${page}: ${comments.length} comments, ${newOnPage} new`);

    cursor = data.has_more_headload_comments && data.next_min_id ? data.next_min_id : null;
    if (!cursor) {
      store.initialCrawlComplete = true;
      walkedAll = true;
      break;
    }
    // Newest-first ordering: a page with nothing new means everything older is already stored.
    if (!fullScan && comments.length > 0 && newOnPage === 0) break;
    await sleep(REQUEST_DELAY_MS);
  }

  // Only a walk that reached the last page can tell a top-level comment is gone.
  if (walkedAll) {
    for (const c of Object.values(store.comments)) if (!c.parentId && !seen.has(c.id)) markMissing(c);
  }

  // --- Replies for threads whose reply count changed ---
  for (const parentId of threadsToRefresh) {
    let childCursor: string | null = null;
    let replyCount = 0;
    let newReplies = 0;
    do {
      await sleep(REQUEST_DELAY_MS);
      const qs: string = childCursor ? `?min_id=${encodeURIComponent(childCursor)}` : "";
      const data = await api(`/api/v1/media/${mediaId}/comments/${parentId}/child_comments/${qs}`);
      for (const c of data.child_comments ?? []) if (addComment(c, parentId)) newReplies++;
      replyCount = data.child_comment_count ?? replyCount;
      childCursor = data.has_more_head_child_comments ? data.next_min_child_cursor ?? null : null;
    } while (childCursor);
    store.replyCounts[parentId] = replyCount;
    for (const r of Object.values(store.comments)) if (r.parentId === parentId && !seen.has(r.id)) markMissing(r);
    log(`  thread ${parentId}: ${newReplies} new repl${newReplies === 1 ? "y" : "ies"}`);
  }

  // Replies disappear along with their parent.
  for (const r of Object.values(store.comments)) {
    if (r.parentId && store.comments[r.parentId]?.missingSince && !seen.has(r.id)) markMissing(r);
  }
  if (missing) log(`${missing} previously saved comment(s) no longer found`);

  store.lastRunAt = runAt;
  fs.mkdirSync(opts.outDir, { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(store, null, 2));
  fs.writeFileSync(mdPath, renderMarkdown(store, runAt, opts.timeZone));

  return { jsonPath, mdPath, total: Object.keys(store.comments).length, added, missing };
}

export function renderMarkdown(store: CommentStore, runAt: string, timeZone = DEFAULT_TIME_ZONE): string {
  const all = Object.values(store.comments);
  const byTime = (a: StoredComment, b: StoredComment) => a.createdAt - b.createdAt;
  const roots = all.filter((c) => !c.parentId).sort(byTime);
  const replies = new Map<string, StoredComment[]>();
  for (const c of all) {
    if (!c.parentId) continue;
    if (!replies.has(c.parentId)) replies.set(c.parentId, []);
    replies.get(c.parentId)!.push(c);
  }
  const newCount = all.filter((c) => c.firstSeenAt === runAt).length;
  const missingCount = all.filter((c) => c.missingSince).length;

  const header = (c: StoredComment) => {
    const parts = [`**@${c.username}**`, formatDate(c.createdAt, timeZone)];
    if (c.likes) parts.push(`♥ ${c.likes}`);
    if (c.firstSeenAt === runAt) parts.push("[N]");
    if (c.missingSince) parts.push(`[D] _no longer found since ${formatDate(Date.parse(c.missingSince) / 1000, timeZone)}_`);
    return parts.join(" · ");
  };
  const indent = (text: string, prefix: string) =>
    text
      .split("\n")
      .map((line) => (line.trim() ? prefix + line : prefix.trimEnd()))
      .join("\n");

  const out: string[] = [];
  out.push(`# Comments on ${store.owner ? `@${store.owner}'s post` : "Instagram post"} ${store.shortcode}`, "");
  out.push(`<${store.postUrl}>`, "");
  if (store.caption) out.push(indent(store.caption, "> "), "");
  const summary = [
    `${all.length} comments in ${roots.length} threads`,
    `last updated ${formatDate(Date.parse(runAt) / 1000, timeZone)}`,
    `${newCount} new this run [N]`,
  ];
  if (missingCount) summary.push(`${missingCount} no longer found [D]`);
  out.push(
    `_${summary.join(" · ")}_`,
    "",
    "---",
    ""
  );

  for (const root of roots) {
    out.push(header(root), "", indent(root.text, ""), "");
    for (const r of (replies.get(root.id) ?? []).sort(byTime)) {
      out.push(`> ↳ ${header(r)}`, ">", indent(r.text, "> "), "");
    }
    out.push("---", "");
  }

  return out.join("\n");
}

async function igGet(url: string, sessionId: string, log: (msg: string) => void): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://www.instagram.com${url}`, {
      headers: {
        "x-ig-app-id": IG_APP_ID,
        "user-agent": USER_AGENT,
        "sec-fetch-site": "same-origin",
        "sec-fetch-mode": "cors",
        "sec-fetch-dest": "empty",
        referer: "https://www.instagram.com/",
        cookie: `sessionid=${sessionId}`,
      },
    });
    const body = await res.text();

    if (res.status === 429 || res.status >= 500) {
      if (attempt >= MAX_RETRIES) throw new Error(`Instagram returned HTTP ${res.status} after ${MAX_RETRIES} retries`);
      const wait = 5000 * 2 ** attempt;
      log(`  HTTP ${res.status}, retrying in ${wait / 1000}s…`);
      await sleep(wait);
      continue;
    }
    if (body.trimStart().startsWith("<")) {
      throw new Error("Instagram returned an HTML page instead of JSON — the session cookie is probably expired, get a fresh sessionid");
    }
    const data = JSON.parse(body);
    if (!res.ok || data.status === "fail") {
      throw new Error(`Instagram API error (HTTP ${res.status}): ${data.message ?? body.slice(0, 200)}`);
    }
    return data;
  }
}

// "2026-10-14 10:45 CEST" — the zone abbreviation is per timestamp, so DST changes stay unambiguous.
export function formatDate(unixSeconds: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZoneName: "short",
  }).formatToParts(new Date(unixSeconds * 1000));
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute} ${p.timeZoneName}`;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
