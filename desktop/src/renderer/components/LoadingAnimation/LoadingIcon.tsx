// Copyright (c) 2016-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

/**
 * A function component for inlining SVG code for animation logo loader
 * Modified for Yap: draws the Yap bubble instead of the Mattermost compass logo.
 */
function LoadingAnimation() {
    return (
        <svg
            width='104'
            height='104'
            viewBox='0 0 104 104'
            xmlns='http://www.w3.org/2000/svg'
        >
            <defs>
                <linearGradient
                    id='LoadingAnimation__spinner-gradient'
                    x1='0%'
                    y1='72px'
                    x2='0%'
                    y2='32px'
                    gradientUnits='userSpaceOnUse'
                >
                    <stop
                        offset='0'
                        className='LoadingAnimation__spinner-gradient-color'
                        stopOpacity='1'
                    />
                    <stop
                        offset='1'
                        className='LoadingAnimation__spinner-gradient-color'
                        stopOpacity='0'
                    />
                </linearGradient>
                <mask id='LoadingAnimation__base-wipe-mask'>
                    <rect
                        x='0'
                        y='0'
                        width='104'
                        height='104'
                        fill='white'
                    />
                    <g className='LoadingAnimation__compass-base-mask-container'>
                        <circle
                            className='LoadingAnimation__compass-base-mask'
                            r='27'
                            cx='52'
                            cy='52'
                            fill='white'
                            stroke='black'
                            strokeWidth='54'
                        />
                    </g>
                </mask>
                <mask id='LoadingAnimation__bubble-dots-mask'>
                    <rect
                        x='0'
                        y='0'
                        width='104'
                        height='104'
                        fill='white'
                    />
                    <g transform='translate(4 2.4) scale(0.4)'>
                        <path
                            d='M60 104a16 16 0 1 0 32 0a16 16 0 1 0-32 0zM104 104a16 16 0 1 0 32 0a16 16 0 1 0-32 0zM148 104a16 16 0 1 0 32 0a16 16 0 1 0-32 0z'
                            fill='black'
                        />
                    </g>
                </mask>
                <mask id='LoadingAnimation__spinner-left-half-mask'>
                    <rect
                        x='0'
                        y='0'
                        width='52'
                        height='104'
                        fill='white'
                    />
                    <circle
                        className='LoadingAnimation__spinner-mask'
                        r='20'
                        cx='52'
                        cy='52'
                        fill='black'
                    />
                </mask>
                <mask id='LoadingAnimation__spinner-right-half-mask'>
                    <rect
                        x='52'
                        y='0'
                        width='52'
                        height='104'
                        fill='white'
                    />
                    <circle
                        className='LoadingAnimation__spinner-mask'
                        r='20'
                        cx='52'
                        cy='52'
                        fill='black'
                    />
                </mask>
            </defs>
            <g
                className='LoadingAnimation__spinner-container'
            >
                <g className='LoadingAnimation__spinner'>
                    <circle
                        r='25'
                        cx='52'
                        cy='52'
                        fill='currentColor'
                        mask='url(#LoadingAnimation__spinner-left-half-mask)'
                    />
                    <circle
                        r='25'
                        cx='52'
                        cy='52'
                        fill='url(#LoadingAnimation__spinner-gradient)'
                        mask='url(#LoadingAnimation__spinner-right-half-mask)'
                    />
                </g>
            </g>
            <g className='LoadingAnimation__compass'>
                <g
                    className='LoadingAnimation__compass-base-container'
                    mask='url(#LoadingAnimation__base-wipe-mask)'
                >
                    <g
                        className='LoadingAnimation__compass-base'
                        mask='url(#LoadingAnimation__bubble-dots-mask)'
                    >
                        <path
                            transform='translate(4 2.4) scale(0.4)'
                            d='M40 32h160a24 24 0 0 1 24 24v96a24 24 0 0 1-24 24H104l-48 40v-40H40a24 24 0 0 1-24-24V56a24 24 0 0 1 24-24z'
                            fill='currentColor'
                        />
                    </g>
                </g>
                <g className='LoadingAnimation__compass-needle-container'>
                    <g className='LoadingAnimation__compass-needle'/>
                </g>
            </g>
        </svg>
    );
}

export default LoadingAnimation;
