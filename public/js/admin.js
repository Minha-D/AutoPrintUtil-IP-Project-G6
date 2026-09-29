function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return 'Unavailable';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

function formatDuration(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return days ? `${days}d ${hours}h` : `${hours}h ${minutes}m`;
}

function setText(id, value) {
  document.getElementById(id).textContent = value;
}

function makeCell(text) {
  const cell = document.createElement('td');
  cell.textContent = text;
  return cell;
}

function setEmptyRow(tbody, columns, message) {
  const row = document.createElement('tr');
  const cell = makeCell(message);
  cell.colSpan = columns;
  cell.className = 'text-secondary';
  row.appendChild(cell);
  tbody.replaceChildren(row);
}

function renderMachine(machine) {
  setText('machineName', machine.hostname);
  setText('machinePlatform', `${machine.platform} · ${machine.architecture}`);
  setText('cpuName', machine.cpu);
  setText('cpuCount', `${machine.cpuCount} logical processors`);
  setText('cpuUsage', machine.cpuUsage === null ? 'Load unavailable' : `${machine.cpuUsage}% current load`);
  const memoryUsed = machine.memory.total - machine.memory.free;
  const memoryPercent = machine.memory.total ? Math.round(memoryUsed / machine.memory.total * 100) : 0;
  setText('memoryUsage', `${memoryPercent}% used`);
  setText('memoryDetail', `${formatBytes(memoryUsed)} of ${formatBytes(machine.memory.total)}`);
  setText('machineUptime', formatDuration(machine.uptime));
  const disk = machine.disk;
  setText('diskUsage', disk.error ? 'Disk: Unavailable' : `Disk: ${formatBytes(disk.used)} of ${formatBytes(disk.total)} used`);
}

function renderPrinters(data) {
  const tbody = document.getElementById('printersBody');
  tbody.replaceChildren();
  setText('printerSummary', `${data.printers.length} found`);
  if (!data.printers.length) {
    setEmptyRow(tbody, 4, data.printerError || 'No printers were detected.');
  } else {
    data.printers.forEach(printer => {
      const row = document.createElement('tr');
      row.appendChild(makeCell(printer.name));
      const statusCell = document.createElement('td');
      const dot = document.createElement('span');
      dot.className = 'status-dot';
      if (['Normal', 'Available', 'Printing', 'Processing', 'I/O active', 'Power save'].includes(printer.status)) dot.classList.add('status-good');
      else if (['Offline', 'Error'].includes(printer.status)) dot.classList.add('status-bad');
      else dot.classList.add('status-warn');
      statusCell.append(dot, document.createTextNode(printer.status));
      row.appendChild(statusCell);
      row.appendChild(makeCell(printer.isDefault ? 'Yes' : 'No'));
      row.appendChild(makeCell(printer.jobCount === null ? 'Not reported' : String(printer.jobCount)));
      tbody.appendChild(row);
    });
  }
  const errorBox = document.getElementById('printerError');
  errorBox.textContent = data.printerError || '';
  errorBox.classList.toggle('d-none', !data.printerError);
}

function renderUsers(users) {
  const tbody = document.getElementById('usersBody');
  tbody.replaceChildren();
  setText('userCount', `${users.length} accounts`);
  if (!users.length) return setEmptyRow(tbody, 4, 'No login users are configured.');
  users.forEach(user => {
    const row = document.createElement('tr');
    row.appendChild(makeCell(user.name));
    row.appendChild(makeCell(user.studentId));
    row.appendChild(makeCell(String(user.documents)));
    row.appendChild(makeCell(formatBytes(user.storageBytes)));
    tbody.appendChild(row);
  });
}

function renderFailures(failures) {
  const container = document.getElementById('failuresBody');
  container.replaceChildren();
  if (!failures.length) {
    const message = document.createElement('div');
    message.className = 'text-secondary';
    message.textContent = 'No print errors recorded.';
    container.appendChild(message);
    return;
  }
  failures.forEach(failure => {
    const item = document.createElement('div');
    item.className = 'failure';
    const detail = document.createElement('div');
    detail.className = 'small text-secondary';
    detail.textContent = `${failure.studentId} · ${failure.documentId} · ${failure.occurredAt ? new Date(failure.occurredAt).toLocaleString() : 'Time unavailable'}`;
    const error = document.createElement('div');
    error.className = 'failure-message';
    error.textContent = failure.error;
    item.append(detail, error);
    container.appendChild(item);
  });
}

function renderPaymentRequests(requests) {
  const container = document.getElementById('paymentRequestsBody');
  container.replaceChildren();
  setText('paymentApprovalCount', `${requests.length} pending`);
  if (!requests.length) {
    const empty = document.createElement('div');
    empty.className = 'text-secondary';
    empty.textContent = 'No payment requests awaiting approval.';
    container.appendChild(empty);
    return;
  }

  requests.forEach(request => {
    const item = document.createElement('article');
    item.className = 'border rounded p-3 mb-3';
    const title = document.createElement('div');
    title.className = 'd-flex flex-wrap justify-content-between gap-2 fw-semibold';
    const file = document.createElement('span');
    file.textContent = request.filename;
    const total = document.createElement('span');
    total.textContent = `৳${request.totalBdt} BDT`;
    title.append(file, total);

    const details = document.createElement('div');
    details.className = 'small text-secondary mt-2';
    const studentName = request.studentName || 'Unknown user';
    const requestedAt = request.requestedAt ? new Date(request.requestedAt).toLocaleString() : 'Time unavailable';
    details.textContent = `${studentName} (${request.studentId || 'ID unavailable'}) · ${request.pages} pages × ${request.copies} copies · ${request.color === 'bw' ? 'Black & white' : 'Color'} at ৳${request.ratePerPage}/page · ${requestedAt}`;

    const actions = document.createElement('div');
    actions.className = 'd-flex justify-content-end gap-2 mt-3';
    for (const decision of ['reject', 'approve']) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = decision === 'approve' ? 'btn btn-success btn-sm' : 'btn btn-outline-danger btn-sm';
      button.dataset.paymentDecision = decision;
      button.dataset.requestId = request.requestId;
      button.textContent = decision === 'approve' ? 'Confirm paid · Approve print' : 'Reject';
      actions.appendChild(button);
    }
    item.append(title, details, actions);
    container.appendChild(item);
  });
}

function renderPaymentHistory(requests) {
  const tbody = document.getElementById('adminPaymentHistoryBody');
  tbody.replaceChildren();
  setText('adminPaymentHistoryCount', `${requests.length} records`);
  if (!requests.length) return setEmptyRow(tbody, 6, 'No payment history recorded.');

  requests.forEach(request => {
    const row = document.createElement('tr');
    row.appendChild(makeCell(request.requestedAt ? new Date(request.requestedAt).toLocaleString() : '—'));
    row.appendChild(makeCell(`${request.studentName} (${request.studentId})`));
    row.appendChild(makeCell(request.filename));
    row.appendChild(makeCell(`${request.totalPages} pages · ৳${request.totalBdt} BDT`));
    const paymentCell = makeCell(request.status === 'approved'
      ? `Approved${request.reviewedAt ? ` · ${new Date(request.reviewedAt).toLocaleString()}` : ''}${request.reviewedBy ? ` · by ${request.reviewedBy}` : ''}`
      : request.status === 'rejected'
        ? `Rejected${request.rejectionReason ? ` · ${request.rejectionReason}` : ''}`
        : 'Awaiting admin');
    row.appendChild(paymentCell);

    const printCell = makeCell(request.printStatus === 'failed'
      ? `Failed · ${request.printError || 'Print error'}`
      : request.printStatus || (request.status === 'rejected' ? 'Not printed' : 'Not started'));
    row.appendChild(printCell);
    tbody.appendChild(row);
  });
}

async function loadPaymentRequests() {
  const [pendingResponse, historyResponse] = await Promise.all([
    fetch('/api/admin/payment-requests'),
    fetch('/api/admin/payment-history')
  ]);
  if ([pendingResponse.status, historyResponse.status].some(status => status === 401 || status === 403)) {
    window.location.href = '/admin';
    return;
  }
  if (!pendingResponse.ok || !historyResponse.ok) throw new Error('Could not load payment history.');
  renderPaymentRequests(await pendingResponse.json());
  renderPaymentHistory(await historyResponse.json());
}

document.getElementById('paymentRequestsBody').addEventListener('click', async event => {
  const button = event.target.closest('[data-payment-decision]');
  if (!button) return;
  button.disabled = true;
  try {
    const response = await fetch(`/api/admin/payment-requests/${encodeURIComponent(button.dataset.requestId)}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: button.dataset.paymentDecision })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not review request.');
    await Promise.all([loadPaymentRequests(), loadStatus()]);
  } catch (error) {
    button.disabled = false;
    window.alert(error.message);
  }
});

function renderStatus(data) {
  renderMachine(data.machine);
  renderPrinters(data);
  renderUsers(data.users);
  renderFailures(data.failures);
  setText('uploadsStorage', formatBytes(data.storage.uploadsBytes));
  setText('databaseStorage', formatBytes(data.storage.databaseBytes));
  setText('totalStorage', formatBytes(data.storage.applicationDataBytes));
  setText('documentCount', `${data.storage.documents} uploaded documents`);
  setText('queuedCount', String(data.printQueue.queued));
  setText('printingCount', String(data.printQueue.printing));
  setText('completedCount', String(data.printQueue.completed));
  setText('failedCount', String(data.printQueue.failed));
  setText('refreshedAt', `Updated ${new Date(data.refreshedAt).toLocaleTimeString()}`);
}

async function loadStatus() {
  const errorBox = document.getElementById('loadError');
  try {
    const response = await fetch('/api/admin/status');
    if (response.status === 401 || response.status === 403) {
      window.location.href = '/admin';
      return;
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load system status.');
    renderStatus(data);
    await loadPaymentRequests();
    errorBox.classList.add('d-none');
  } catch (err) {
    errorBox.textContent = err.message || 'Could not load system status.';
    errorBox.classList.remove('d-none');
  }
}

document.getElementById('refreshBtn').addEventListener('click', loadStatus);
document.getElementById('logoutBtn').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/admin';
});
loadStatus();
setInterval(loadStatus, 15000);