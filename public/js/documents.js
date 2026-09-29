let currentPrintDocId = null;
let printStatusPollTimer = null;
let printStatusRefreshInProgress = false;
let quoteRefreshId = 0;
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
  if (data.isAdmin) {
    const adminLink = document.createElement('a');
    adminLink.href = 'admin.html';
    adminLink.className = 'btn btn-outline-light btn-sm me-3';
    adminLink.textContent = 'Admin';
    document.getElementById('studentName').after(adminLink);
  }
}

async function loadDocuments() {
  const res = await fetch('/api/documents');
  const docs = await res.json();
  const tbody = document.getElementById('docsTableBody');
  const noDocsMsg = document.getElementById('noDocsMsg');

  tbody.innerHTML = '';

  if (docs.length === 0) {
    noDocsMsg.classList.remove('d-none');
    refreshPrintStatuses();
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
        <button class="btn btn-sm btn-outline-secondary me-1" onclick="viewDoc('${doc.id}', '${doc.originalName}')">View</button>
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
  } else if (job.status === 'pending_approval') {
    badge.classList.add('bg-warning', 'text-dark');
    badge.textContent = 'Payment approval pending';
  } else if (job.status === 'rejected') {
    badge.classList.add('bg-danger');
    badge.textContent = 'Payment request rejected';
  } else {
    badge.classList.add('d-none');
  }
}

function paymentStatusLabel(status) {
  return ({
    pending_approval: 'Awaiting admin',
    approved: 'Approved',
    rejected: 'Rejected'
  })[status] || status || 'Unknown';
}

function printStatusLabel(request) {
  if (request.printStatus === 'queued') return 'Queued';
  if (request.printStatus === 'printing') return 'Printing';
  if (request.printStatus === 'completed') return 'Complete';
  if (request.printStatus === 'failed') return request.printError
    ? `Failed · ${request.printError}`
    : 'Failed';
  if (request.status === 'rejected') return request.rejectionReason || 'Not printed';
  if (request.status === 'pending_approval') return 'Waiting for approval';
  return 'Not started';
}

function renderPaymentHistory(requests) {
  const tbody = document.getElementById('paymentHistoryBody');
  const count = document.getElementById('paymentHistoryCount');
  if (!tbody || !count) return;
  tbody.replaceChildren();
  count.textContent = `${requests.length} requests`;

  if (!requests.length) {
    const row = tbody.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 5;
    cell.className = 'text-muted';
    cell.textContent = 'No payment requests yet.';
    return;
  }

  requests.forEach(request => {
    const row = tbody.insertRow();
    row.insertCell().textContent = request.requestedAt
      ? new Date(request.requestedAt).toLocaleString()
      : '—';
    row.insertCell().textContent = request.filename;
    row.insertCell().textContent = `${request.totalPages} pages · ৳${request.totalBdt} BDT`;
    row.insertCell().textContent = paymentStatusLabel(request.status);
    const printCell = row.insertCell();
    printCell.textContent = printStatusLabel(request);
    if (request.printError || request.rejectionReason) {
      printCell.title = request.printError || request.rejectionReason;
    }
  });
}

async function refreshPrintStatuses() {
  if (printStatusRefreshInProgress) return;
  if (printStatusPollTimer) {
    clearTimeout(printStatusPollTimer);
    printStatusPollTimer = null;
  }
  printStatusRefreshInProgress = true;

  try {
    const [jobsResponse, requestsResponse] = await Promise.all([
      fetch('/api/print/jobs'),
      fetch('/api/print/payment-requests')
    ]);
    if (!jobsResponse.ok || !requestsResponse.ok) return;

    const jobs = await jobsResponse.json();
    const requests = await requestsResponse.json();
    renderPaymentHistory(requests);
    const latestJobs = new Map();
    requests.forEach(request => {
      if (!latestJobs.has(request.documentId)) {
        latestJobs.set(request.documentId, {
          status: request.status,
          position: null,
          error: request.rejectionReason
        });
      }
    });
    jobs.forEach(job => {
      const current = latestJobs.get(job.documentId);
      if (!current || current.status === 'approved') {
        latestJobs.set(job.documentId, job);
      }
    });
    latestJobs.forEach((job, documentId) => updateDocumentPrintStatus(documentId, job));

    if (jobs.some(job => job.status === 'queued' || job.status === 'printing') ||
      requests.some(request => request.status === 'pending_approval')) {
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

function viewDoc(documentId, originalName) {
  document.getElementById('previewFileName').textContent = originalName;
  document.getElementById('previewEmbed').src = `/api/documents/${encodeURIComponent(documentId)}/file`;
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
  confirmButton.textContent = "I've paid · Request approval";
  updatePrintQuote();
  printModal.show();
}

async function updatePrintQuote() {
  if (!currentPrintDocId) return;
  const refreshId = ++quoteRefreshId;
  const copies = document.getElementById('copiesInput').value;
  const color = document.querySelector('input[name="colorMode"]:checked').value;
  const statusBox = document.getElementById('printStatus');
  const confirmButton = document.getElementById('confirmPrintBtn');
  confirmButton.disabled = true;
  document.getElementById('receiptPages').textContent = 'Calculating…';

  try {
    const response = await fetch('/api/print/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId: currentPrintDocId, copies, color })
    });
    const data = await response.json();
    if (refreshId !== quoteRefreshId) return;
    if (!response.ok) throw new Error(data.error || 'Could not calculate receipt.');

    document.getElementById('receiptPages').textContent = `${data.pages} (${data.totalPages} printed)`;
    document.getElementById('receiptCopies').textContent = String(data.copies);
    document.getElementById('receiptRate').textContent = `${data.color === 'bw' ? 'Black & white' : 'Color'} · ৳${data.ratePerPage}/page`;
    document.getElementById('receiptTotal').textContent = `৳${data.totalBdt} BDT`;
    statusBox.className = 'alert alert-info d-none';
    confirmButton.disabled = false;
  } catch (error) {
    if (refreshId !== quoteRefreshId) return;
    statusBox.className = 'alert alert-danger';
    document.getElementById('printStatusMessage').textContent = error.message;
    document.getElementById('printStatusSpinner').classList.add('d-none');
  } finally {
    if (refreshId === quoteRefreshId && !statusBox.classList.contains('alert-danger')) {
      confirmButton.disabled = false;
    }
  }
}

document.getElementById('copiesInput').addEventListener('change', updatePrintQuote);
document.querySelectorAll('input[name="colorMode"]').forEach(input => {
  input.addEventListener('change', updatePrintQuote);
});

document.getElementById('confirmPrintBtn').addEventListener('click', async () => {
  const copies = document.getElementById('copiesInput').value;
  const color = document.querySelector('input[name="colorMode"]:checked').value;
  const statusBox = document.getElementById('printStatus');
  const statusMessage = document.getElementById('printStatusMessage');
  const statusSpinner = document.getElementById('printStatusSpinner');
  const confirmButton = document.getElementById('confirmPrintBtn');

  statusBox.className = 'alert alert-info';
  statusMessage.textContent = 'Sending your payment confirmation to the admin...';
  statusSpinner.classList.remove('d-none');
  confirmButton.disabled = true;
  confirmButton.textContent = 'Sending...';

  try {
    const res = await fetch('/api/print/payment-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId: currentPrintDocId, copies, color })
    });
    const data = await res.json();

    if (!res.ok) {
      statusBox.className = 'alert alert-danger';
      statusMessage.textContent = data.error || 'The payment request could not be sent.';
      statusSpinner.classList.add('d-none');
      confirmButton.disabled = false;
      confirmButton.textContent = 'Try Again';
      return;
    }

    statusBox.className = 'alert alert-warning';
    statusMessage.textContent = `Payment request sent for ৳${data.totalBdt} BDT. Printing starts after admin approval.`;
    statusSpinner.classList.add('d-none');
    confirmButton.textContent = 'Approval requested';
    updateDocumentPrintStatus(currentPrintDocId, { status: data.status });
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
