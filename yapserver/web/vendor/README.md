# Vendored libraries

Served from Yap's own server because the Content-Security-Policy only allows scripts from it.

| File | Package | Version | License |
| --- | --- | --- | --- |
| `heroui/heroui.css` | [@heroui/styles](https://www.npmjs.com/package/@heroui/styles), compiled with [tailwindcss](https://www.npmjs.com/package/tailwindcss) 4.3.5 (MIT) by `ui-build/`: only the components Yap UI uses | 3.2.8 | Apache-2.0 (`heroui/LICENSE`) |
| `livekit-client.umd.js` | [livekit-client](https://www.npmjs.com/package/livekit-client) (`dist/livekit-client.umd.js`, source map comment removed) | 2.23.0 | Apache-2.0 (`livekit-client.LICENSE`) |

npm integrity of the package tarball: `sha512-j9Kg86nJjBjNFUD+ukp2jwMCGa0k+YD5gU//RzAM+ZY3pbG631QCte7fQjwqWMmtBzhDJL9nKYuOLMv/9IbAxg==`

To update, run `npm pack livekit-client@<version>`, check the tarball's integrity against `npm view livekit-client@<version> dist.integrity`, copy `package/dist/livekit-client.umd.js` here, and update this table.

To update HeroUI's styles, bump `@heroui/styles` (and `tailwindcss`/`@tailwindcss/cli`) in `ui-build/package.json`, run `npm install && npm run build` there, check `npm run test`, and update the version above. The compiled file starts with Tailwind's MIT license banner.
