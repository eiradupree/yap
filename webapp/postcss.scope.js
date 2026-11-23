// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Confines HeroUI's compiled stylesheet to elements inside SCOPE, so it can't restyle
// the host page. Runs after Tailwind (see postcss.config.js).
//
// - Theme variables HeroUI and Tailwind declare on :root/:host move to SCOPE.
//   Several share names with Compass tokens (--radius-xl, --radius-xs), so they
//   must not reach the host's :root.
// - HeroUI's dark-theme blocks are dropped: src/heroui/theme.css maps HeroUI's
//   tokens onto the user's Mattermost theme, which already covers dark themes.
// - Reset rules (Tailwind's preflight and HeroUI's base) only apply inside SCOPE,
//   wrapped in :where() so they add no specificity.
// - Cascade layers are flattened. The host's CSS is unlayered, and unlayered rules
//   beat layered ones regardless of specificity, so a layered `.label` would lose
//   to the host's bare `label` rule. Unlayered, ordinary specificity applies.
// - rem becomes px. HeroUI sizes everything in rem against a 16px root, but the
//   host sets the root font size to 10px, which would shrink HeroUI by 40%.

const SCOPE = '.yap-ui';
const WHERE = `:where(${SCOPE})`;

const ROOT = /^(:root|:host|html|body|\.light|\.default|\[data-theme="?(light|default)"?\]|:host\((\.light|\.default|\[data-theme="?(light|default)"?\])\))$/;
const DARK = /^(\.dark|\[data-theme="?dark"?\]|:host\((\.dark|\[data-theme="?dark"?\])\))$/;
const ROOT_PREFIX = /^(:root|:host|html|body)(?=[\s>+~:[.])/;
const UNIVERSAL = /^(\*|::?[a-z-]+)$/;
const REM = /(-?\d*\.?\d+)rem\b/g;
const ROOT_FONT_SIZE = 16;

function remToPx(value) {
    return value.replace(REM, (_, n) => `${Number((parseFloat(n) * ROOT_FONT_SIZE).toFixed(3))}px`);
}

// Layers whose rules are resets or theme variables rather than component styles.
const GLOBAL_LAYERS = new Set(['theme', 'base', 'properties']);

function layerOf(node) {
    for (let p = node.parent; p; p = p.parent) {
        if (p.type === 'atrule' && p.name === 'layer') {
            return p.params.trim();
        }
    }
    return '';
}

function inKeyframes(node) {
    for (let p = node.parent; p; p = p.parent) {
        if (p.type === 'atrule' && (/keyframes$/).test(p.name)) {
            return true;
        }
    }
    return false;
}

function scopeSelector(selector, isGlobal) {
    const sel = selector.trim();
    if (ROOT.test(sel)) {
        return [SCOPE];
    }
    if (DARK.test(sel)) {
        return [];
    }
    if (ROOT_PREFIX.test(sel)) {
        return [sel.replace(ROOT_PREFIX, SCOPE)];
    }
    if (!isGlobal) {
        return [sel];
    }
    if (UNIVERSAL.test(sel)) {
        // `*` also matches the scope element itself; `::before` its own pseudo-elements.
        return [sel === '*' ? WHERE : `${WHERE}${sel}`, `${WHERE} ${sel}`];
    }
    return [`${WHERE} ${sel}`];
}

function flattenLayers(root) {
    let found = false;
    root.walkAtRules('layer', (atRule) => {
        found = true;
        if (atRule.nodes) {
            atRule.replaceWith(atRule.nodes);
        } else {
            atRule.remove();
        }
    });
    return found;
}

module.exports = () => ({
    postcssPlugin: 'yap-scope',
    OnceExit(root) {
        root.walkRules((rule) => {
            if (inKeyframes(rule)) {
                return;
            }
            const isGlobal = GLOBAL_LAYERS.has(layerOf(rule));
            const selectors = [...new Set(rule.selectors.flatMap((s) => scopeSelector(s, isGlobal)))];
            if (selectors.length) {
                rule.selectors = selectors;
            } else {
                rule.remove();
            }
        });

        root.walkDecls((decl) => {
            if (decl.value.includes('rem')) {
                decl.value = remToPx(decl.value);
            }
        });
        root.walkAtRules((atRule) => {
            if (atRule.params.includes('rem')) {
                atRule.params = remToPx(atRule.params);
            }
        });

        // Flatten layers, keeping source order. Replacing a node while walking skips
        // the layers nested inside it, so repeat until none are left.
        while (flattenLayers(root)) {
            // Keep going.
        }
    },
});
module.exports.postcss = true;
