'use strict';

// Pure helpers, kept free of Electron so they can be unit tested with node --test.

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Turns what the user typed into a server origin like "https://chat.example.com".
 * Adds https:// when no scheme is given. Plain http is only allowed for this
 * computer, so passwords and session cookies never cross the network unencrypted.
 * Throws an Error with a user-facing message if the input isn't usable.
 */
function normalizeServerUrl(input) {
  let text = String(input || '').trim();
  if (!text) throw new Error('Enter your Yap server address.');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = 'https://' + text;
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error("That doesn't look like a web address.");
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('The address must start with https://');
  }
  if (url.protocol === 'http:' && !LOCAL_HOSTS.has(url.hostname)) {
    throw new Error('Use https:// for servers on other computers.');
  }
  if (url.username || url.password) throw new Error("Don't put a username or password in the address.");
  return url.origin;
}

/** Reads the unread count from a page title like "(3) Yap". */
function unreadFromTitle(title) {
  const m = /^\((\d+)\)/.exec(String(title || ''));
  return m ? Number(m[1]) : 0;
}

/** Whether a URL belongs to the connected server (same scheme, host and port). */
function isServerUrl(target, serverOrigin) {
  try {
    return new URL(target).origin === serverOrigin;
  } catch {
    return false;
  }
}

/** Links that may be handed to the system browser or mail app. */
function isSafeExternal(target) {
  try {
    return ['https:', 'http:', 'mailto:'].includes(new URL(target).protocol);
  } catch {
    return false;
  }
}

module.exports = { normalizeServerUrl, unreadFromTitle, isServerUrl, isSafeExternal };
