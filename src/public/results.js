// Shared result-rendering, copy, and download logic used by both pages.

function slugifyTitle(title) {
  return title.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || "ocr";
}

function renderSections(sections) {
  const container = document.getElementById("text-output");
  container.innerHTML = "";

  sections.forEach((section) => {
    const card = document.createElement("div");
    card.className = "section";

    if (sections.length > 1) {
      const label = document.createElement("div");
      label.className = "section-label";
      label.textContent = section.source;
      card.appendChild(label);
    }

    const body = document.createElement("div");
    body.className = "section-body";
    // Render each blank-line-separated chunk as its own paragraph.
    const paragraphs = section.text.split(/\n\s*\n/).filter((p) => p.trim());
    if (paragraphs.length === 0) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "(no text detected)";
      body.appendChild(empty);
    } else {
      paragraphs.forEach((p) => {
        const para = document.createElement("p");
        para.textContent = p.trim();
        body.appendChild(para);
      });
    }

    card.appendChild(body);
    container.appendChild(card);
  });
}

function setupResultActions(getState) {
  const copyBtn = document.getElementById("copy-btn");
  const saveBtn = document.getElementById("save-btn");

  copyBtn.addEventListener("click", () => {
    const { text } = getState();
    navigator.clipboard.writeText(text);
    copyBtn.textContent = "Copied!";
    setTimeout(() => (copyBtn.textContent = "Copy"), 1500);
  });

  saveBtn.addEventListener("click", () => {
    const { text, title } = getState();
    const content = `# ${title}\n\n_Extracted: ${new Date().toLocaleString()}_\n\n---\n\n${text}`;
    const blob = new Blob([content], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${slugifyTitle(title)}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
}
