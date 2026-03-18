import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export async function saveToAppleNotes(
  text: string,
  title: string
): Promise<void> {
  if (process.platform !== "darwin") {
    throw new Error("Apple Notes output is only supported on macOS.");
  }

  // AppleScript expects HTML for the body — plain text with newlines works
  // if we escape it properly. We do a minimal escape here.
  const escapedTitle = title.replace(/"/g, '\\"').replace(/\\/g, "\\\\");
  const escapedBody = text
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n");

  const script = `
    tell application "Notes"
      tell account "iCloud"
        make new note with properties {name:"${escapedTitle}", body:"${escapedBody}"}
      end tell
    end tell
  `;

  await execFileAsync("osascript", ["-e", script]);
  console.log(`  ✓ Saved to Apple Notes: "${title}"`);
}
