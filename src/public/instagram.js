const urlInput    = document.getElementById('url-input');
const submitBtn   = document.getElementById('submit-btn');
const downloadBtn = document.getElementById('download-btn');
const spinner     = document.getElementById('spinner');
const result      = document.getElementById('result');
const resultTitle = document.getElementById('result-title');

let lastState = { text: '', title: '' };
setupResultActions(() => lastState);

// Enable buttons when URL is non-empty
urlInput.addEventListener('input', () => {
  const empty = urlInput.value.trim() === '';
  submitBtn.disabled = empty;
  downloadBtn.disabled = empty;
});

submitBtn.addEventListener('click', async () => {
  const url = urlInput.value.trim();
  const title = document.getElementById('title-input').value.trim();

  if (!url) return;

  submitBtn.disabled = true;
  spinner.classList.add('active');
  result.classList.remove('visible');

  try {
    const res = await fetch('/extract-instagram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, title }),
    });
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
    submitBtn.disabled = urlInput.value.trim() === '';
    spinner.classList.remove('active');
  }
});

downloadBtn.addEventListener('click', async () => {
  const url = urlInput.value.trim();
  if (!url) return;

  downloadBtn.disabled = true;
  downloadBtn.textContent = 'Downloading…';
  spinner.classList.add('active');

  try {
    const res = await fetch('/download-instagram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Unknown error');
    }

    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match ? match[1] : 'instagram-carousel.zip';

    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (err) {
    alert('Error: ' + err.message);
  } finally {
    downloadBtn.disabled = urlInput.value.trim() === '';
    downloadBtn.textContent = 'Download images';
    spinner.classList.remove('active');
  }
});
