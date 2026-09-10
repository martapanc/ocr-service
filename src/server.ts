import "dotenv/config";
import express, { Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import archiver from "archiver";
import { extractTextFromImages, sectionsToMarkdown } from "./ocr.js";
import { scrapeInstagramCarousel } from "./instagram.js";

const app = express();
const PORT = Number(process.env.PORT ?? 3089);

// ── Multer (temp upload storage) ──────────────────────────────────────────────
const upload = multer({
  dest: "tmp/",
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB per file
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/jpg"];
    cb(null, allowed.includes(file.mimetype));
  },
});

// ── Static UI ─────────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "public")));

// ── Upload + extract route ─────────────────────────────────────────────────────
app.post(
  "/extract",
  upload.array("images", 20) as unknown as express.RequestHandler,
  async (req: Request, res: Response) => {
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      res.status(400).json({ error: "No images uploaded." });
      return;
    }

    const title: string =
      (req.body.title as string)?.trim() ||
      `OCR – ${new Date().toLocaleDateString()}`;

    console.log(`\n[${new Date().toISOString()}] Received ${files.length} file(s)`);

    try {
      const sections = await extractTextFromImages(
        files.map((f) => ({
          path: f.path,
          originalname: f.originalname,
        }))
      );

      res.json({ title, sections, text: sectionsToMarkdown(sections) });
    } catch (err) {
      console.error("Extraction failed:", err);
      res.status(500).json({ error: String(err) });
    } finally {
      // Clean up temp files
      for (const file of files) {
        fs.unlink(file.path, () => {});
      }
    }
  }
);

// ── Instagram carousel route ───────────────────────────────────────────────────
app.post("/extract-instagram", express.json(), async (req: Request, res: Response) => {
  const { url, title: rawTitle } = req.body as { url: string; title?: string };

  if (!url) {
    res.status(400).json({ error: "Missing url in request body." });
    return;
  }

  const title: string = rawTitle?.trim() || `OCR – ${new Date().toLocaleDateString()}`;

  console.log(`\n[${new Date().toISOString()}] Instagram extract: ${url}`);

  let tempFiles: Array<{ path: string; originalname: string }> = [];

  try {
    tempFiles = await scrapeInstagramCarousel(url);

    const sections = await extractTextFromImages(tempFiles);

    res.json({ title, sections, text: sectionsToMarkdown(sections) });
  } catch (err: any) {
    console.error("Instagram extraction failed:", err);
    const status = err.status ?? 500;
    res.status(status).json({ error: err.message ?? String(err) });
  } finally {
    for (const file of tempFiles) {
      fs.unlink(file.path, () => {});
    }
  }
});

// ── Instagram download route ───────────────────────────────────────────────────
app.post("/download-instagram", express.json(), async (req: Request, res: Response) => {
  const { url } = req.body as { url: string };

  if (!url) {
    res.status(400).json({ error: "Missing url in request body." });
    return;
  }

  console.log(`\n[${new Date().toISOString()}] Instagram download: ${url}`);

  let tempFiles: Array<{ path: string; originalname: string }> = [];

  try {
    tempFiles = await scrapeInstagramCarousel(url);

    const slugMatch = url.match(/\/p\/([A-Za-z0-9_-]+)/);
    const slug = slugMatch ? slugMatch[1] : "carousel";

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="instagram-${slug}.zip"`);

    const archive = archiver("zip", { zlib: { level: 6 } });
    archive.pipe(res);

    for (const file of tempFiles) {
      archive.file(file.path, { name: file.originalname });
    }

    await archive.finalize();
  } catch (err: any) {
    console.error("Instagram download failed:", err);
    if (!res.headersSent) {
      const status = err.status ?? 500;
      res.status(status).json({ error: err.message ?? String(err) });
    }
  } finally {
    for (const file of tempFiles) {
      fs.unlink(file.path, () => {});
    }
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🔍 OCR Service running at http://localhost:${PORT}`);
});
