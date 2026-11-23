// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {ReactNode} from 'react';
import {I18nProvider, UNSAFE_PortalProvider as PortalProvider} from 'react-aria';
import {useIntl} from 'react-intl';

import './heroui.css';
import './theme.css';

const SCOPE = 'yap-ui';

// Overlays (select menus, popovers) render here instead of straight into <body>,
// so they get HeroUI's scoped styles and the theme mapping in theme.css.
let portal: HTMLElement | undefined;
function getPortal() {
    if (!portal || !portal.isConnected) {
        portal = document.createElement('div');
        portal.className = SCOPE;
        document.body.appendChild(portal);
    }
    return portal;
}

type Props = {
    children: ReactNode;
    className?: string;
};

// Wrap every component the plugin registers with the host in this. HeroUI's styles
// only apply inside it, and React Aria formats and announces in the user's locale.
export default function YapUIProvider({children, className}: Props) {
    const {locale} = useIntl();
    return (
        <I18nProvider locale={locale}>
            <PortalProvider getContainer={getPortal}>
                <div className={className ? `${SCOPE} ${className}` : SCOPE}>
                    {children}
                </div>
            </PortalProvider>
        </I18nProvider>
    );
}
