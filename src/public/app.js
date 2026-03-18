const fileInput   = document.getElementById('file-input');
const dropZone    = document.getElementById('drop-zone');
const previewGrid = document.getElementById('preview-grid');
const submitBtn   = document.getElementById('submit-btn');
const spinner     = document.getElementById('spinner');
const result      = document.getElementById('result');
const statusDiv   = document.getElementById('destination-status');
const textOutput  = document.getElementById('text-output');
const copyBtn     = document.getElementById('copy-btn');

let selectedFiles = [];
const selectedOutputs = new Set(['file']);

// Chip toggle
document.querySelectorAll('.output-chip').forEach(chip => {
  // Apply default selection on init
  if (selectedOutputs.has(chip.dataset.value)) {
    chip.classList.add('selected');
    chip.querySelector('.chip-indicator').textContent = '✓';
  }
  chip.addEventListener('click', () => {
    const value = chip.dataset.value;
    if (selectedOutputs.has(value)) {
      selectedOutputs.delete(value);
      chip.classList.remove('selected');
      chip.querySelector('.chip-indicator').textContent = '';
    } else {
      selectedOutputs.add(value);
      chip.classList.add('selected');
      chip.querySelector('.chip-indicator').textContent = '✓';
    }
  });
});

// Drag-over highlight
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  addFiles([...e.dataTransfer.files]);
});

fileInput.addEventListener('change', () => {
  addFiles([...fileInput.files]);
  fileInput.value = '';
});

function addFiles(newFiles) {
  selectedFiles = [...selectedFiles, ...newFiles.filter(f => f.type.startsWith('image/'))];
  renderPreviews();
  submitBtn.disabled = selectedFiles.length === 0;
}

function renderPreviews() {
  previewGrid.innerHTML = '';
  selectedFiles.forEach((file, i) => {
    const url = URL.createObjectURL(file);
    const div = document.createElement('div');
    div.className = 'thumb';
    div.innerHTML = `<img src="${url}" alt="${file.name}" /><button class="remove" data-i="${i}">✕</button>`;
    previewGrid.appendChild(div);
  });
  previewGrid.querySelectorAll('.remove').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedFiles.splice(Number(btn.dataset.i), 1);
      renderPreviews();
      submitBtn.disabled = selectedFiles.length === 0;
    });
  });
}

submitBtn.addEventListener('click', async () => {
  const title = document.getElementById('title-input').value.trim();
  const checkedOutputs = [...selectedOutputs];

  if (selectedFiles.length === 0) return;

  submitBtn.disabled = true;
  spinner.classList.add('active');
  result.classList.remove('visible');

  const formData = new FormData();
  selectedFiles.forEach(f => formData.append('images', f));
  if (title) formData.append('title', title);
  checkedOutputs.forEach(o => formData.append('outputs', o));

  try {
    const res = await fetch('/extract', { method: 'POST', body: formData });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Unknown error');

    // Status rows
    statusDiv.innerHTML = '';
    const labels = { file: '📄 Local file', notion: '🔲 Notion', notes: '🍎 Apple Notes' };
    for (const key of checkedOutputs) {
      const ok = data.results[key] !== undefined && !data.errors[key];
      const errMsg = data.errors[key] ? ` — ${data.errors[key]}` : '';
      statusDiv.innerHTML += `
        <div class="status-row">
          <span class="dot ${ok ? 'ok' : 'err'}"></span>
          <span>${labels[key]}${errMsg}</span>
        </div>`;
    }

    textOutput.textContent = data.text;
    result.classList.add('visible');
    result.scrollIntoView({ behavior: 'smooth' });

  } catch (err) {
    alert('Error: ' + err.message);
  } finally {
    submitBtn.disabled = false;
    spinner.classList.remove('active');
  }
});

copyBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(textOutput.textContent);
  copyBtn.textContent = 'Copied!';
  setTimeout(() => copyBtn.textContent = 'Copy text', 1500);
});
