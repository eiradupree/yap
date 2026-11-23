// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// `?raw` imports an SVG's markup as a string (webpack asset/source).
declare module '*.svg?raw' {
    const markup: string;
    export default markup;
}
