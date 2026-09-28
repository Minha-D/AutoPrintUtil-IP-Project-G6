let currentPrintDocId = null;
let printStatusPollTimer = null;
let printStatusRefreshInProgress = false;
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
    tr.dataset.documentId = doc.id;
    tr.innerHTML = `
      <td>${doc.originalName}</td>
      <td>${new Date(doc.uploadedAt).toLocaleString()}</td>
      <td><span class="badge d-none" data-print-status></span></td>
      <td class="text-end">
        <button class="btn btn-sm btn-outline-secondary me-1" onclick="viewDoc('${doc.filename}', '${doc.originalName}')">View</button>
        <button class="btn btn-sm btn-primary" onclick="openPrintModal('${doc.id}', '${doc.originalName}')">Print</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  refreshPrintStatuses();
}

function updateDocumentPrintStatus(documentId, job) {
  const row = Array.from(document.getElementById('docsTableBody').rows)
    .find(candidate => candidate.dataset.documentId === String(documentId));
  if (!row) return;

  const badge = row.querySelector('[data-print-status]');
  badge.className = 'badge';
  badge.title = job.error || '';

  if (job.status === 'queued') {
    badge.classList.add('bg-warning', 'text-dark');
    badge.textContent = `Pending · position ${job.position}`;
  } else if (job.status === 'printing') {
    badge.classList.add('bg-warning', 'text-dark');
    badge.textContent = 'Printing';
  } else if (job.status === 'completed') {
    badge.classList.add('bg-success');
    badge.textContent = '✓ Print complete';
  } else if (job.status === 'failed') {
    badge.classList.add('bg-danger');
    badge.textContent = 'Print failed';
  } else {
    badge.classList.add('d-none');
  }
}

async function refreshPrintStatuses() {
  if (printStatusRefreshInProgress) return;
  if (printStatusPollTimer) {
    clearTimeout(printStatusPollTimer);
    printStatusPollTimer = null;
  }
  printStatusRefreshInProgress = true;

  try {
    const response = await fetch('/api/print/jobs');
    if (!response.ok) return;

    const jobs = await response.json();
    const latestJobs = new Map();
    jobs.forEach(job => {
      if (!latestJobs.has(job.documentId)) latestJobs.set(job.documentId, job);
    });
    latestJobs.forEach((job, documentId) => updateDocumentPrintStatus(documentId, job));

    if (jobs.some(job => job.status === 'queued' || job.status === 'printing')) {
      printStatusPollTimer = setTimeout(() => {
        printStatusPollTimer = null;
        refreshPrintStatuses();
      }, 1500);
    }
  } catch (err) {
    console.error('Could not refresh print statuses:', err);
  } finally {
    printStatusRefreshInProgress = false;
  }
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
  const statusBox = document.getElementById('printStatus');
  statusBox.className = 'alert alert-info d-none';
  document.getElementById('printStatusSpinner').classList.add('d-none');
  document.getElementById('printStatusMessage').textContent = '';
  const confirmButton = document.getElementById('confirmPrintBtn');
  confirmButton.disabled = false;
  confirmButton.textContent = 'Send to Printer';
  printModal.show();
}

document.getElementById('confirmPrintBtn').addEventListener('click', async () => {
  const copies = document.getElementById('copiesInput').value;
  const color = document.querySelector('input[name="colorMode"]:checked').value;
  const statusBox = document.getElementById('printStatus');
  const statusMessage = document.getElementById('printStatusMessage');
  const statusSpinner = document.getElementById('printStatusSpinner');
  const confirmButton = document.getElementById('confirmPrintBtn');

  statusBox.className = 'alert alert-info';
  statusMessage.textContent = 'Sending your document to the printer...';
  statusSpinner.classList.remove('d-none');
  confirmButton.disabled = true;
  confirmButton.textContent = 'Sending...';

  try {
    const res = await fetch('/api/print', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId: currentPrintDocId, copies, color })
    });
    const data = await res.json();

    if (!res.ok) {
      statusBox.className = 'alert alert-danger';
      statusMessage.textContent = data.error || 'The print job could not be sent.';
      statusSpinner.classList.add('d-none');
      confirmButton.disabled = false;
      confirmButton.textContent = 'Try Again';
      return;
    }

    statusBox.className = 'alert alert-warning';
    statusMessage.textContent = `Added to the print queue. Your position is ${data.position}.`;
    statusSpinner.classList.add('d-none');
    confirmButton.textContent = 'Queued';
    updateDocumentPrintStatus(currentPrintDocId, data);
    printModal.hide();
    refreshPrintStatuses();
  } catch (err) {
    statusBox.className = 'alert alert-danger';
    statusMessage.textContent = 'Could not reach the server. Check your connection and try again.';
    statusSpinner.classList.add('d-none');
    confirmButton.disabled = false;
    confirmButton.textContent = 'Try Again';
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
