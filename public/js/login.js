document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const studentId = document.getElementById('studentId').value.trim();
  const errorBox = document.getElementById('errorBox');
  errorBox.classList.add('d-none');

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId })
    });
    const data = await res.json();

    if (!res.ok) {
      errorBox.textContent = data.error || 'Login failed';
      errorBox.classList.remove('d-none');
      return;
    }

    window.location.href = data.isAdmin ? 'admin.html' : 'documents.html';
  } catch (err) {
    errorBox.textContent = 'Could not reach server';
    errorBox.classList.remove('d-none');
  }
});
