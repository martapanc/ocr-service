import { chromium } from "playwright";
import https from "https";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

const MAX_SLIDES = 20;

export async function scrapeInstagramCarousel(
  postUrl: string
): Promise<Array<{ path: string; originalname: string }>> {
  if (!/instagram\.com\/p\//.test(postUrl)) {
    throw Object.assign(new Error("Not a valid Instagram post URL"), { status: 400 });
  }

  const sessionId = process.env.INSTAGRAM_SESSION_ID;
  if (!sessionId) {
    throw Object.assign(new Error("INSTAGRAM_SESSION_ID env var not set"), { status: 500 });
  }

  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  });

  await context.addCookies([
    {
      name: "sessionid",
      value: sessionId,
      domain: ".instagram.com",
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    },
  ]);

  fs.mkdirSync("tmp", { recursive: true });

  const page = await context.newPage();
  // base path (no query) → full signed URL, in insertion order
  const seen = new Map<string, string>();

  try {
    const baseUrl = postUrl.replace(/\?.*$/, "").replace(/\/$/, "") + "/";

    await page.goto(`${baseUrl}?img_index=1`, {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    });

    // Check for login redirect
    const landedUrl = page.url();
    if (landedUrl.includes("/accounts/login") || landedUrl.includes("/challenge")) {
      throw Object.assign(
        new Error("Instagram auth failed — check session cookie"),
        { status: 401 }
      );
    }

    for (let n = 1; n <= MAX_SLIDES; n++) {
      // Wait for at least one carousel image to be present
      await page
        .waitForSelector("[role='presentation'] img[src]", { timeout: 8000 })
        .catch(() => {});

      // Collect all CDN image srcs visible in the role="presentation" container
      const srcs = await page.$$eval("[role='presentation'] img[src]", (imgs) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (imgs as any[])
          .map((img) => img.src as string)
          .filter((src) => src.includes("fbcdn.net") || src.includes("cdninstagram.com"))
      );

      let newFound = false;
      for (const src of srcs) {
        const basePath = src.split("?")[0];
        if (!seen.has(basePath)) {
          seen.set(basePath, src);
          newFound = true;
        }
      }

      // No Next button → we're on the last slide
      const nextBtn = await page.$("button[aria-label='Next']");
      if (!nextBtn) {
        console.log(`  [instagram] No Next button — reached last slide.`);
        break;
      }

      // If we didn't find new images even though there's a Next button, stop to avoid looping
      if (!newFound) {
        console.log(`  [instagram] No new images at position ${n} — stopping.`);
        break;
      }

      await nextBtn.click();
      // Wait for carousel transition to settle before reading DOM again
      await page.waitForTimeout(1000);
    }
  } finally {
    await page.close();
    await browser.close();
  }

  const imageUrls = [...seen.values()];
  console.log(`  [instagram] Found ${imageUrls.length} unique slide(s)`);

  if (imageUrls.length === 0) {
    throw Object.assign(new Error("No carousel images could be extracted"), { status: 500 });
  }

  const collected: Array<{ path: string; originalname: string }> = [];

  for (let i = 0; i < imageUrls.length; i++) {
    const n = i + 1;
    const tmpPath = path.join("tmp", `ig-slide-${n}-${randomUUID()}.jpg`);
    try {
      await downloadFile(imageUrls[i], tmpPath);
      collected.push({ path: tmpPath, originalname: `slide-${n}.jpg` });
      console.log(`  [instagram] Slide ${n} downloaded → ${tmpPath}`);
    } catch (err) {
      console.warn(`  [instagram] Warning: failed to download slide ${n}:`, err);
    }
  }

  if (collected.length === 0) {
    throw Object.assign(new Error("No carousel images could be extracted"), { status: 500 });
  }

  console.log(`  [instagram] Extracted ${collected.length} slide(s) from ${postUrl}`);
  return collected;
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
        if (res.statusCode !== 200) {
          file.destroy();
          reject(new Error(`HTTP ${res.statusCode} downloading ${url}`));
          return;
        }
        res.pipe(file);
        file.on("finish", () => file.close(() => resolve()));
      })
      .on("error", (err) => {
        file.destroy();
        fs.unlink(dest, () => {});
        reject(err);
      });
  });
}
