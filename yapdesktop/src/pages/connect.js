'use strict';

const params = new URLSearchParams(location.search);
const form = document.getElementById('form');
const input = document.getElementById('url');
const error = document.getElementById('error');
const submit = document.getElementById('submit');
const cancel = document.getElementById('cancel');

input.value = params.get('suggested') || '';
input.focus();
input.select();

// When changing servers, offer a way back to the current one.
const current = params.get('current');
if (current) {
  cancel.hidden = false;
  cancel.addEventListener('click', () => window.yapDesktop.retry());
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  error.textContent = '';
  submit.disabled = true;
  submit.textContent = 'Connecting…';
  try {
    const res = await window.yapDesktop.connect(input.value);
    if (!res.ok) error.textContent = res.error;
  } catch {
    error.textContent = 'Something went wrong. Try again.';
  } finally {
    submit.disabled = false;
    submit.textContent = 'Connect';
  }
});
