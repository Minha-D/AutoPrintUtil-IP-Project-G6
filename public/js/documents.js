let currentPrintDocId = null;
const printModal = new bootstrap.Modal(document.getElementById('printModal'));
const previewModal = new bootstrap.Modal(document.getElementById('previewModal'));

async function checkSession() {
  const res = await fetch('/api/me');
  if (!res.ok) {
    window.location.href = 'login.html';
    return;
  }
  const data = await res.json();
  document.getElementById('studentName').textContent = `${data.name} (${data.studentId})`;
}

async function loadDocuments() {
  const res = await fetch('/api/documents');
  const docs = await res.json();
  const tbody = document.getElementById('docsTableBody');
  const noDocsMsg = document.getElementById('noDocsMsg');

  tbody.innerHTML = '';

  if (docs.length === 0) {
    noDocsMsg.classList.remove('d-none');
    return;
  }
  noDocsMsg.classList.add('d-none');

  docs.forEach(doc => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${doc.originalName}</td>
      <td>${new Date(doc.uploadedAt).toLocaleString()}</td>
      <td class="text-end">
        <button class="btn btn-sm btn-outline-secondary me-1" onclick="viewDoc('${doc.filename}', '${doc.originalName}')">View</button>
        <button class="btn btn-sm btn-primary" onclick="openPrintModal('${doc.id}', '${doc.originalName}')">Print</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function viewDoc(filename, originalName) {
  document.getElementById('previewFileName').textContent = originalName;
  document.getElementById('previewEmbed').src = `/uploads/${filename}`;
  previewModal.show();
}

function openPrintModal(docId, originalName) {
  currentPrintDocId = docId;
  document.getElementById('printFileName').textContent = originalName;
  document.getElementById('copiesInput').value = 1;
  document.getElementById('colorOption').checked = true;
  document.getElementById('printError').classList.add('d-none');
  printModal.show();
}

document.getElementById('confirmPrintBtn').addEventListener('click', async () => {
  const copies = document.getElementById('copiesInput').value;
  const color = document.querySelector('input[name="colorMode"]:checked').value;
  const errorBox = document.getElementById('printError');

  try {
    const res = await fetch('/api/print', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId: currentPrintDocId, copies, color })
    });
    const data = await res.json();

    if (!res.ok) {
      errorBox.textContent = data.error || 'Print failed';
      errorBox.classList.remove('d-none');
      return;
    }

    printModal.hide();
  } catch (err) {
    errorBox.textContent = 'Could not reach server';
    errorBox.classList.remove('d-none');
  }
});

document.getElementById('uploadForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fileInput = document.getElementById('pdfFile');
  const errorBox = document.getElementById('uploadError');
  errorBox.classList.add('d-none');

  if (!fileInput.files.length) return;

  const formData = new FormData();
  formData.append('pdf', fileInput.files[0]);

  try {
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await res.json();

    if (!res.ok) {
      errorBox.textContent = data.error || 'Upload failed';
      errorBox.classList.remove('d-none');
      return;
    }

    fileInput.value = '';
    loadDocuments();
  } catch (err) {
    errorBox.textContent = 'Could not reach server';
    errorBox.classList.remove('d-none');
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = 'login.html';
});

checkSession().then(loadDocuments);
