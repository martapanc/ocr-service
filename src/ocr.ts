import path from "path";
import { createWorker } from "tesseract.js";

// Language(s) to recognise. "ita+eng" handles Italian text that may contain
// English words (URLs, brand names, code, etc.). Add more with "+" if needed.
const TESSERACT_LANG = process.env.TESSERACT_LANG ?? "ita+eng";

export async function extractTextFromImage(filePath: string): Promise<string> {
  // A worker is created per-call so the server stays stateless and parallel
  // uploads don't share state. For high-volume use you'd want a worker pool.
  const worker = await createWorker(TESSERACT_LANG, 1, {
    // Point to the local .traineddata files in the project root
    langPath: path.resolve(process.cwd(), "."),
    // Suppress the verbose Tesseract progress logs
    logger: () => {},
  });

  try {
    const { data } = await worker.recognize(filePath);
    return data.text.trim();
  } finally {
    await worker.terminate();
  }
}

export async function extractTextFromImages(
  files: Array<{ path: string; originalname: string }>
): Promise<string> {
  const results: string[] = [];

  for (const file of files) {
    console.log(`  → Extracting text from ${file.originalname}…`);
    const text = await extractTextFromImage(file.path);
    results.push(`<!-- Source: ${file.originalname} -->\n\n${text}`);
  }

  return results.join("\n\n---\n\n");
}
