// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

module.exports = {

    // Matches the browsers supported by the Mattermost web app. Set at the top
    // level so preset-env and the core-js polyfill plugin both use it.
    targets: {
        chrome: 110,
        firefox: 102,
        edge: 110,
        safari: '16.4',
    },
    presets: [
        ['@babel/preset-env', {
            shippedProposals: true,
        }],

        // The automatic runtime imports react/jsx-runtime, which webpack maps to the host's window.ReactJSXRuntime.
        ['@babel/preset-react', {
            runtime: 'automatic',
        }],

        // Parses .ts files as TypeScript and .tsx files as TypeScript with JSX.
        '@babel/preset-typescript',
    ],
    plugins: [

        // Adds core-js polyfills for the features each file uses that the
        // targets lack. Babel 8 moved this out of preset-env's useBuiltIns.
        // version '3.0' matches the old `corejs: 3` setting, so the bundle
        // gets the same polyfills it did under Babel 7.
        ['babel-plugin-polyfill-corejs3', {
            method: 'usage-global',
            version: '3.0',
            shippedProposals: true,
        }],
    ],
};
