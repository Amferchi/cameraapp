// meta-edit.js: Handles meta tag editing
document.getElementById('meta-form').addEventListener('submit', function(e) {
  e.preventDefault();
  const title = document.getElementById('meta-title').value;
  const image = document.getElementById('meta-image').value;
  fetch('/api/meta', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, image })
  })
    .then(res => res.json())
    .then(data => {
      document.getElementById('meta-message').textContent = data.success ? 'Meta updated!' : (data.message || 'Error');
    });
});
