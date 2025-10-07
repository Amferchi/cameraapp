// Simple client-side login logic (for demo; use server-side in production)
document.getElementById('login-form').addEventListener('submit', function(e) {
  e.preventDefault();
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        // Save session (simple)
        localStorage.setItem('auth', 'true');
        window.location.href = data.redirect || '/viewer.html';
      } else {
        document.getElementById('login-error').textContent = data.message || 'Login failed';
      }
    });
});
