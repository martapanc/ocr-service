const fileInput   = document.getElementById('file-input');
const dropZone    = document.getElementById('drop-zone');
const previewGrid = document.getElementById('preview-grid');
const submitBtn   = document.getElementById('submit-btn');
const spinner     = document.getElementById('spinner');
const result      = document.getElementById('result');
const resultTitle = document.getElementById('result-title');

let selectedFiles = [];
let lastState = { text: '', title: '' };
setupResultActions(() => lastState);

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

let dragSrcIndex = null;

function renderPreviews() {
  previewGrid.innerHTML = '';
  selectedFiles.forEach((file, i) => {
    const url = URL.createObjectURL(file);
    const div = document.createElement('div');
    div.className = 'thumb';
    div.draggable = true;
    div.innerHTML = `<img src="${url}" alt="${file.name}" /><button class="remove" data-i="${i}">✕</button><span class="thumb-name">${file.name}</span>`;

    div.addEventListener('dragstart', () => {
      dragSrcIndex = i;
      div.classList.add('dragging');
    });
    div.addEventListener('dragend', () => div.classList.remove('dragging'));
    div.addEventListener('dragover', e => { e.preventDefault(); div.classList.add('drag-target'); });
    div.addEventListener('dragleave', () => div.classList.remove('drag-target'));
    div.addEventListener('drop', e => {
      e.preventDefault();
      div.classList.remove('drag-target');
      if (dragSrcIndex === null || dragSrcIndex === i) return;
      const [moved] = selectedFiles.splice(dragSrcIndex, 1);
      selectedFiles.splice(i, 0, moved);
      renderPreviews();
    });

    div.querySelector('.remove').addEventListener('click', () => {
      selectedFiles.splice(i, 1);
      renderPreviews();
      submitBtn.disabled = selectedFiles.length === 0;
    });

    previewGrid.appendChild(div);
  });
}

submitBtn.addEventListener('click', async () => {
  const title = document.getElementById('title-input').value.trim();

  if (selectedFiles.length === 0) return;

  submitBtn.disabled = true;
  spinner.classList.add('active');
  result.classList.remove('visible');

  const formData = new FormData();
  selectedFiles.forEach(f => formData.append('images', f));
  if (title) formData.append('title', title);

  try {
    const res = await fetch('/extract', { method: 'POST', body: formData });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Unknown error');

    lastState = { text: data.text, title: data.title };
    resultTitle.textContent = data.title;
    renderSections(data.sections);
    result.classList.add('visible');
    result.scrollIntoView({ behavior: 'smooth' });

  } catch (err) {
    alert('Error: ' + err.message);
  } finally {
    submitBtn.disabled = false;
    spinner.classList.remove('active');
  }
});
