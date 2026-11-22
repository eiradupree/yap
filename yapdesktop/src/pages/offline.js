'use strict';

const params = new URLSearchParams(location.search);
document.getElementById('server').textContent = params.get('server') || 'the server';
document.getElementById('detail').textContent = params.get('error') || '';
document.getElementById('retry').addEventListener('click', () => window.yapDesktop.retry());
document.getElementById('change').addEventListener('click', () => window.yapDesktop.changeServer());

// Try again on our own when the connection comes back.
window.addEventListener('online', () => window.yapDesktop.retry());
