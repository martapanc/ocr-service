import "dotenv/config";
import express, { Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { extractTextFromImages } from "./ocr.js";
import { saveToFile } from "./outputs/file.js";
import { saveToNotion } from "./outputs/notion.js";
import { saveToAppleNotes } from "./outputs/notes.js";

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

    const outputs: string[] = (req.body.outputs as string[] | string) instanceof Array
      ? (req.body.outputs as string[])
      : [req.body.outputs as string];

    console.log(`\n[${new Date().toISOString()}] Received ${files.length} file(s) — outputs: ${outputs.join(", ")}`);

    try {
      // 1. Extract text from all images via Claude
      const text = await extractTextFromImages(
        files.map((f) => ({
          path: f.path,
          originalname: f.originalname,
        }))
      );

      // 2. Save to requested destinations
      const results: Record<string, string | null> = {};
      const errors: Record<string, string> = {};

      if (outputs.includes("file")) {
        try {
          results.filePath = saveToFile(text, title);
        } catch (e) {
          errors.file = String(e);
        }
      }

      if (outputs.includes("notion")) {
        try {
          await saveToNotion(text, title);
          results.notion = "ok";
        } catch (e) {
          errors.notion = String(e);
        }
      }

      if (outputs.includes("notes")) {
        try {
          await saveToAppleNotes(text, title);
          results.notes = "ok";
        } catch (e) {
          errors.notes = String(e);
        }
      }

      res.json({ title, text, results, errors });
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

app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🔍 OCR Service running at http://localhost:${PORT}`);
});
