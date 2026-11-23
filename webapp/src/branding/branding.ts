// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Shows Yap's logo where the host shows Mattermost's: the header of the pages before
// sign-in, the global header, the browser tab's icon and the avatar on system
// messages. The host loads plugins before anyone signs in, so this covers the login
// page too. It has no setting for these logos, so this targets the host's own
// markup; see branding.css. The server's NameSiteYap setting names the site Yap.

import yapMark from '../../../assets/yap-icon.svg?raw';

import './branding.css';

const svgUrl = (svg: string) => `data:image/svg+xml,${encodeURIComponent(svg)}`;

// The host swaps the favicon to show unread messages and mentions, so keep a dot
// for those: red for mentions, like the host's.
const withDot = (color: string) => yapMark.replace('</svg>', `<circle cx="196" cy="44" r="40" fill="${color}" stroke="#FFFFFF" stroke-width="12"/></svg>`);

const ICONS = {
    default: svgUrl(yapMark),
    unread: svgUrl(withDot('#7C3AED')),
    mentions: svgUrl(withDot('#D24B4E')),
};

const HOST_ICON = /\/favicon\/favicon-(default|unread|mentions)-\d+x\d+\.png/;
const HOST_TOUCH_ICON = /\/icon_\d+x\d+\.png/;

function iconFor(href: string) {
    const match = HOST_ICON.exec(href);
    if (match) {
        return ICONS[match[1] as keyof typeof ICONS];
    }
    return HOST_TOUCH_ICON.test(href) ? ICONS.default : undefined;
}

const original = new Map<HTMLLinkElement, string>();

function rebrand(link: HTMLLinkElement) {
    const href = link.getAttribute('href') ?? '';
    const replacement = iconFor(href);
    if (replacement) {
        original.set(link, href);
        link.setAttribute('href', replacement);
    }
}

const ICON_LINKS = 'link[rel~="icon"], link[rel="apple-touch-icon"]';

// Returns a function that puts the host's icons back, for when the plugin is disabled.
export function installBranding(): () => void {
    document.documentElement.classList.add('yap-branded');
    document.querySelectorAll<HTMLLinkElement>(ICON_LINKS).forEach(rebrand);

    // The host rewrites the favicon's href whenever the unread state changes.
    const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
            if (m.type === 'attributes' && m.target instanceof HTMLLinkElement && m.target.matches(ICON_LINKS)) {
                rebrand(m.target);
            }
            m.addedNodes.forEach((node) => {
                if (node instanceof HTMLLinkElement && node.matches(ICON_LINKS)) {
                    rebrand(node);
                }
            });
        }
    });
    observer.observe(document.head, {subtree: true, childList: true, attributes: true, attributeFilter: ['href']});

    return () => {
        observer.disconnect();
        document.documentElement.classList.remove('yap-branded');
        original.forEach((href, link) => link.setAttribute('href', href));
        original.clear();
    };
}
