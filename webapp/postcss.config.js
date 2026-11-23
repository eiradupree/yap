// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

const tailwind = require('@tailwindcss/postcss');

const scope = require('./postcss.scope');

// Only src/heroui/heroui.css goes through PostCSS (see webpack.config.js).
// Tailwind minifies in production builds; jest maps CSS to a stub and never gets here.
module.exports = (api) => ({
    plugins: [
        tailwind({optimize: api.mode === 'production'}),
        scope,
    ],
});
