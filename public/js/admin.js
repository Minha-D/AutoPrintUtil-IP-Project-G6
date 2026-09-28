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
      window.location.href = 'login.html';
      return;
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load system status.');
    renderStatus(data);
    errorBox.classList.add('d-none');
  } catch (err) {
    errorBox.textContent = err.message || 'Could not load system status.';
    errorBox.classList.remove('d-none');
  }
}

document.getElementById('refreshBtn').addEventListener('click', loadStatus);
document.getElementById('logoutBtn').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = 'login.html';
});
loadStatus();
setInterval(loadStatus, 15000);