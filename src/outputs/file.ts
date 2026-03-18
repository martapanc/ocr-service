import fs from "fs";
import path from "path";

export function saveToFile(text: string, title: string): string {
  const outputDir = process.env.OUTPUT_DIR ?? "./output";
  fs.mkdirSync(outputDir, { recursive: true });

  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 19);
  const slug = title.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  const filename = `${timestamp}-${slug}.md`;
  const filePath = path.join(outputDir, filename);

  const content = `# ${title}\n\n_Extracted: ${new Date().toLocaleString()}_\n\n---\n\n${text}`;
  fs.writeFileSync(filePath, content, "utf-8");

  console.log(`  ✓ Saved to file: ${filePath}`);
  return filePath;
}
