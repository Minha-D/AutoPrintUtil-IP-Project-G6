document.getElementById('adminLoginForm').addEventListener('submit', async event => {
  event.preventDefault();
  const passwordInput = document.getElementById('adminPassword');
  const errorBox = document.getElementById('loginError');
  const loginButton = document.getElementById('loginButton');
  errorBox.classList.add('d-none');
  loginButton.disabled = true;
  loginButton.textContent = 'Checking…';

  try {
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: passwordInput.value })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not sign in.');
    window.location.href = '/admin';
  } catch (error) {
    errorBox.textContent = error.message || 'Could not reach the server.';
    errorBox.classList.remove('d-none');
    passwordInput.select();
    loginButton.disabled = false;
    loginButton.textContent = 'Open admin panel';
  }
});