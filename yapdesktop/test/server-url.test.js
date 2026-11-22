'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeServerUrl, unreadFromTitle, isServerUrl, isSafeExternal } = require('../src/server-url');

test('normalizeServerUrl adds https and strips paths', () => {
  assert.equal(normalizeServerUrl('chat.example.com'), 'https://chat.example.com');
  assert.equal(normalizeServerUrl('  https://chat.example.com/some/path?x=1 '), 'https://chat.example.com');
  assert.equal(normalizeServerUrl('https://chat.example.com:8443'), 'https://chat.example.com:8443');
  assert.equal(normalizeServerUrl('HTTPS://Chat.Example.com'), 'https://chat.example.com');
});

test('normalizeServerUrl allows http only for this computer', () => {
  assert.equal(normalizeServerUrl('http://localhost:8080'), 'http://localhost:8080');
  assert.equal(normalizeServerUrl('http://127.0.0.1:8080'), 'http://127.0.0.1:8080');
  assert.throws(() => normalizeServerUrl('http://chat.example.com'), /https/);
});

test('normalizeServerUrl rejects unusable input', () => {
  assert.throws(() => normalizeServerUrl(''), /Enter/);
  assert.throws(() => normalizeServerUrl('file:///etc/passwd'), /https/);
  assert.throws(() => normalizeServerUrl('javascript://alert(1)'), /https/);
  assert.throws(() => normalizeServerUrl('https://user:pw@chat.example.com'), /username/);
  assert.throws(() => normalizeServerUrl('https://'), /web address/);
});

test('unreadFromTitle', () => {
  assert.equal(unreadFromTitle('(3) Yap'), 3);
  assert.equal(unreadFromTitle('(120) Yap'), 120);
  assert.equal(unreadFromTitle('Yap'), 0);
  assert.equal(unreadFromTitle('Yap (3)'), 0);
  assert.equal(unreadFromTitle(undefined), 0);
});

test('isServerUrl matches scheme, host and port exactly', () => {
  const origin = 'https://chat.example.com';
  assert.ok(isServerUrl('https://chat.example.com/api/me', origin));
  assert.ok(!isServerUrl('http://chat.example.com/', origin));
  assert.ok(!isServerUrl('https://chat.example.com.evil.net/', origin));
  assert.ok(!isServerUrl('https://chat.example.com:444/', origin));
  assert.ok(!isServerUrl('not a url', origin));
});

test('isSafeExternal only allows web and mail links', () => {
  assert.ok(isSafeExternal('https://example.com'));
  assert.ok(isSafeExternal('mailto:a@example.com'));
  assert.ok(!isSafeExternal('file:///Applications/Calculator.app'));
  assert.ok(!isSafeExternal('smb://share/x'));
  assert.ok(!isSafeExternal('javascript:alert(1)'));
});
