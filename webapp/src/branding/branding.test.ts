// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {installBranding} from './branding';

const HOST = '/static/images/favicon/favicon-default-16x16.png';

function addIcon(href: string, rel = 'icon') {
    const link = document.createElement('link');
    link.rel = rel;
    link.setAttribute('href', href);
    document.head.appendChild(link);
    return link;
}

// MutationObserver callbacks run as microtasks.
const settle = () => new Promise((resolve) => setTimeout(resolve));

afterEach(() => {
    document.head.innerHTML = '';
});

test('swaps the favicon for Yap’s and restores it when the plugin is disabled', async () => {
    const icon = addIcon(HOST);
    const touch = addIcon('/static/icon_76x76.png', 'apple-touch-icon');
    const other = addIcon('/static/manifest.json', 'manifest');

    const remove = installBranding();
    expect(document.documentElement).toHaveClass('yap-branded');
    expect(icon.getAttribute('href')).toMatch(/^data:image\/svg\+xml,/);
    expect(touch.getAttribute('href')).toBe(icon.getAttribute('href'));
    expect(other.getAttribute('href')).toBe('/static/manifest.json');

    remove();
    expect(document.documentElement).not.toHaveClass('yap-branded');
    expect(icon.getAttribute('href')).toBe(HOST);
    expect(touch.getAttribute('href')).toBe('/static/icon_76x76.png');
});

test('keeps the unread and mention dots when the host updates the favicon', async () => {
    const icon = addIcon(HOST);
    const remove = installBranding();
    const plain = icon.getAttribute('href');

    icon.setAttribute('href', '/static/images/favicon/favicon-mentions-16x16.png');
    await settle();
    const mentions = icon.getAttribute('href');
    expect(mentions).toMatch(/^data:image\/svg\+xml,/);
    expect(mentions).not.toBe(plain);
    expect(decodeURIComponent(mentions!)).toContain('#D24B4E');

    icon.setAttribute('href', '/static/images/favicon/favicon-unread-16x16.png');
    await settle();
    expect(decodeURIComponent(icon.getAttribute('href')!)).toContain('#7C3AED');

    // A favicon the host adds later is swapped too.
    const late = addIcon('/static/images/favicon/favicon-default-32x32.png');
    await settle();
    expect(late.getAttribute('href')).toBe(plain);

    remove();
});
