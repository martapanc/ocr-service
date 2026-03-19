import path from "path";
import { createWorker } from "tesseract.js";

// Language(s) to recognise. "ita+eng" handles Italian text that may contain
// English words (URLs, brand names, code, etc.). Add more with "+" if needed.
const TESSERACT_LANG = process.env.TESSERACT_LANG ?? "ita+eng";

// Lines whose Tesseract confidence is below this threshold are treated as noise.
// Range 0–100; 40 filters most symbol/garbage lines while keeping real text.
const CONFIDENCE_THRESHOLD = Number(process.env.OCR_CONFIDENCE_THRESHOLD ?? 40);

console.log({CONFIDENCE_THRESHOLD});

export async function extractTextFromImage(filePath: string): Promise<string> {
  const worker = await createWorker(TESSERACT_LANG, 1, {
    langPath: path.resolve(process.cwd(), "."),
    logger: () => {},
    errorHandler: () => {},
  });

  try {
    const { data } = await worker.recognize(filePath);

    // Filter out low-confidence lines (noise, symbols, gibberish)
    const goodLines: string[] = (data.lines as Array<{ confidence: number; text: string }>)
      .filter((l) => l.confidence >= CONFIDENCE_THRESHOLD)
      .map((l) => l.text.trim())
      .filter(Boolean);

    return rejoinLines(goodLines);
  } finally {
    await worker.terminate();
  }
}

/**
 * Joins broken lines back into sentences.
 * - Lines that end with sentence-closing punctuation (.?!) start a new paragraph.
 * - All other line breaks are replaced with a single space (the image broke a
 *   sentence across lines, not a real paragraph break).
 */
function rejoinLines(lines: string[]): string {
  if (lines.length === 0) return "";

  let result = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    result += line;
    if (i < lines.length - 1) {
      // Sentence-ending punctuation → paragraph break; otherwise join with space
      result += /[.?!]\s*$/.test(line) ? "\n" : " ";
    }
  }
  return result.trim();
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
