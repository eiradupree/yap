#!/usr/bin/env bash
# Regenerates Yap's app, tray and menu bar icons in src/assets from the SVG
# sources in resources/yap. Requires rsvg-convert (librsvg), ImageMagick and
# macOS iconutil: brew install librsvg imagemagick
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/resources/yap"
ASSETS="$ROOT/src/assets"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

DARK='#3F4350'
LIGHT='#FFFFFF'
UNREAD='#7C3AED'
MENTION='#D24B4E'

# svg <source> <glyph color> <badge color> <size> <output>
svg() {
    sed -e "s/GLYPH/$2/" -e "s/BADGE/$3/" "$SRC/$1" | rsvg-convert -w "$4" -h "$4" -o "$5"
}

# App icon: macOS .icns, Windows .ico, Linux and notification PNGs
mkdir -p "$TMP/icon.iconset"
for size in 16 32 128 256 512; do
    rsvg-convert -w "$size" -h "$size" "$SRC/app-icon.svg" -o "$TMP/icon.iconset/icon_${size}x${size}.png"
    rsvg-convert -w $((size * 2)) -h $((size * 2)) "$SRC/app-icon.svg" -o "$TMP/icon.iconset/icon_${size}x${size}@2x.png"
done
iconutil -c icns -o "$ASSETS/icon.icns" "$TMP/icon.iconset"
rsvg-convert -w 256 -h 256 "$SRC/app-icon.svg" -o "$TMP/icon256.png"
magick "$TMP/icon256.png" -define icon:auto-resize=256,64,48,32,24,16 "$ASSETS/icon.ico"
rsvg-convert -w 512 -h 512 "$SRC/app-icon.svg" -o "$ASSETS/linux/app_icon.png"
rsvg-convert -w 48 -h 48 "$SRC/app-icon.svg" -o "$ASSETS/appicon_48.png"
rsvg-convert -w 32 -h 32 "$SRC/app-icon.svg" -o "$ASSETS/appicon_with_spacing_32.png"

# macOS menu bar template icons (black glyph; macOS tints them)
for size in 16 20 24 32; do
    svg glyph.svg '#000000' '#000000' "$size" "$ASSETS/osx/menuIcons/MenuIcon${size}Template.png"
    svg glyph.svg '#000000' '#000000' $((size * 2)) "$ASSETS/osx/menuIcons/MenuIcon${size}Template@2x.png"
    svg glyph-badge.svg '#000000' '#000000' "$size" "$ASSETS/osx/menuIcons/MenuIconUnread${size}Template.png"
    svg glyph-badge.svg '#000000' '#000000' $((size * 2)) "$ASSETS/osx/menuIcons/MenuIconUnread${size}Template@2x.png"
done

# Windows tray (.ico) and Linux top bar (.png): "dark" is a dark glyph for light
# backgrounds, "light" is a white glyph for dark backgrounds
for theme in dark light; do
    if [ "$theme" = dark ]; then color="$DARK"; else color="$LIGHT"; fi
    for state in normal unread mention; do
        case "$state" in
            normal) source=glyph.svg; badge="$color"; suffix='' ;;
            unread) source=glyph-badge.svg; badge="$UNREAD"; suffix='_unread' ;;
            mention) source=glyph-badge.svg; badge="$MENTION"; suffix='_mention' ;;
        esac
        for size in 16 24 32 48 64; do
            svg "$source" "$color" "$badge" "$size" "$TMP/tray_$size.png"
        done
        magick "$TMP"/tray_{16,24,32,48,64}.png "$ASSETS/windows/tray_${theme}${suffix}.ico"
        svg "$source" "$color" "$badge" 16 "$ASSETS/linux/top_bar_${theme}${suffix}_16.png"
        svg "$source" "$color" "$badge" 32 "$ASSETS/linux/top_bar_${theme}${suffix}_16@2x.png"
    done
done

# Windows notification-area SVGs bundled with the installer
for state in normal unread mention; do
    case "$state" in
        normal) sed -e "s/GLYPH/$DARK/" -e "s/BADGE/$DARK/" "$SRC/glyph.svg" > "$ROOT/resources/windows/tray.svg" ;;
        unread) sed -e "s/GLYPH/$DARK/" -e "s/BADGE/$UNREAD/" "$SRC/glyph-badge.svg" > "$ROOT/resources/windows/tray_unread.svg" ;;
        mention) sed -e "s/GLYPH/$DARK/" -e "s/BADGE/$MENTION/" "$SRC/glyph-badge.svg" > "$ROOT/resources/windows/tray_mention.svg" ;;
    esac
done

# DMG background and the downloads-list thumbnail for app updates
rsvg-convert "$SRC/dmg-background.svg" -o "$ASSETS/osx/DMG_BG.png"
cp "$SRC/update-thumbnail.svg" "$ASSETS/thumbnails/app-update.svg"

echo "Yap assets generated in $ASSETS"
