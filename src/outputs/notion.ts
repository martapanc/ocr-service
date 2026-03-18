// Notion's rich text blocks have a 2000-character limit per block.
// This helper splits long text into multiple paragraph blocks.
function toNotionBlocks(text: string) {
  const LIMIT = 1990;
  const paragraphs = text.split(/\n\n+/);
  const blocks: object[] = [];

  for (const para of paragraphs) {
    // Split further if a single paragraph exceeds the limit
    const chunks: string[] = [];
    for (let i = 0; i < para.length; i += LIMIT) {
      chunks.push(para.slice(i, i + LIMIT));
    }
    for (const chunk of chunks) {
      blocks.push({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [{ type: "text", text: { content: chunk } }],
        },
      });
    }
  }

  return blocks;
}

export async function saveToNotion(text: string, title: string): Promise<void> {
  const token = process.env.NOTION_TOKEN;
  const databaseId = process.env.NOTION_DATABASE_ID;

  if (!token || !databaseId) {
    throw new Error(
      "NOTION_TOKEN and NOTION_DATABASE_ID must be set in .env to use Notion output."
    );
  }

  const body = {
    parent: { database_id: databaseId },
    properties: {
      // Assumes your database has a "Name" title property.
      // Adjust the key if yours is named differently (e.g. "Title").
      Name: {
        title: [{ text: { content: title } }],
      },
    },
    children: toNotionBlocks(text),
  };

  const response = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Notion-Version": "2022-06-28",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Notion API error ${response.status}: ${err}`);
  }

  const page = (await response.json()) as { url?: string };
  console.log(`  ✓ Saved to Notion: ${page.url ?? "unknown URL"}`);
}
