// Copyright (c) 2016-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.
// Modified for Yap: replaced the Mattermost logotype with the Yap wordmark.

import React from 'react';

type Props = {
    width?: number;
    height?: number;
}

export default ({
    width = 170,
    height = 28,
}: Props) => (
    <svg
        width={width}
        height={height}
        viewBox='0 0 170 28'
        fill='none'
        xmlns='http://www.w3.org/2000/svg'
    >
        <g transform='translate(-1.6 -2.8) scale(0.13)'>
            <path
                fillRule='evenodd'
                clipRule='evenodd'
                d='M40 32h160a24 24 0 0 1 24 24v96a24 24 0 0 1-24 24H104l-48 40v-40H40a24 24 0 0 1-24-24V56a24 24 0 0 1 24-24z M60 104a16 16 0 1 0 32 0a16 16 0 1 0-32 0zM104 104a16 16 0 1 0 32 0a16 16 0 1 0-32 0zM148 104a16 16 0 1 0 32 0a16 16 0 1 0-32 0z'
                fill='#7C3AED'
            />
        </g>
        <text
            x='36'
            y='21'
            fontSize='20'
            fontWeight='700'
            fontFamily='inherit'
            fill='var(--center-channel-color)'
        >
            {'Yap'}
        </text>
    </svg>
);
