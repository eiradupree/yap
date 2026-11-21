# Yap

Yap is an open-source, Slack-like workspace built on [Mattermost](https://mattermost.com). It ships as a Mattermost plugin (`com.eiradupree.yap`) that adds team-chat features on top of a self-hosted Mattermost server.

Yap is fully open source. It uses only open-source Mattermost components (the Apache-2.0 plugin API in `github.com/mattermost/mattermost/server/public` and MIT-licensed webapp packages) and does not include or depend on Mattermost Enterprise or Source Available code.

## Status

Yap is in early development. It is based on the [Mattermost plugin starter template](https://github.com/mattermost/mattermost-plugin-starter-template) and currently includes that template's example features:

- **Channel status**: run `/channelstatus at-risk` in a channel to show an **At risk** tag in the channel header for everyone, live. `/channelstatus` shows the current status and `/channelstatus clear` removes it.
- **Channel status sidebar**: click the tag, or the flag icon in the App Bar, to view or change the status. Changing it requires permission to edit the channel header.
- **Webhook endpoint**: `POST <SiteURL>/plugins/com.eiradupree.yap/webhook` with an `X-Webhook-Secret` header. Generate the secret under System Console > Plugins > Yap.

## Desktop app

`desktop/` contains Yap Desktop, a native app for macOS that runs on both Intel and Apple silicon Macs. It is a modified version of the Apache-2.0 [Mattermost Desktop](https://github.com/mattermost/desktop) app. See [desktop/README.md](desktop/README.md) to build it.

## Roadmap

Planned work (the mobile app, desktop signing and updates) and open decisions are tracked in [docs/UPGRADES.md](docs/UPGRADES.md).

## Plugin requirements

- Mattermost Server 11.7 or later (the oldest supported ESR)
- Go (version in `go.mod`) and Node.js (version in `.nvmrc`) to build
- GNU Make

On macOS with Homebrew:

```bash
brew install go node make
export PATH="$(brew --prefix make)/libexec/gnubin:$PATH"   # use GNU make as `make`
```

## Building

```bash
make dist
```

This builds the Go server for Linux, macOS and Windows plus the webapp bundle, and produces a single plugin file:

```
dist/com.eiradupree.yap-<version>.tar.gz
```

Upload it under System Console > Plugins > Plugin Management, or deploy it to a local server with `make deploy` (see `make help`).

## Development

```bash
SKIP_DOCKER_TESTS=1 go test ./server/...   # server unit tests
cd webapp && npm test                      # webapp tests
make check-style                           # lint server and webapp
make test                                  # full check before pushing
```

`plugin.json` is the source of truth for the plugin ID, version and settings. `AGENTS.md`, `server/AGENTS.md` and `webapp/AGENTS.md` describe the code layout and conventions. For general plugin development, see the [Mattermost plugin documentation](https://developers.mattermost.com/extend/plugins/).

## Contributing

Issues and pull requests are welcome at <https://github.com/eiradupree/yap>. Please keep contributions open source: don't add Mattermost Enterprise or Source Available code, or dependencies under non-open-source licenses.

## License

Yap is licensed under the [Apache License 2.0](LICENSE).

## Trademarks

Yap is built on Mattermost. Mattermost is a trademark of Mattermost, Inc. Yap is an independent project and is not affiliated with, sponsored by or endorsed by Mattermost, Inc. Yap follows the [Mattermost Trademark Standards of Use](https://mattermost.com/trademark-standards-of-use/): it uses the Mattermost name only to describe what Yap is built on, and does not use Mattermost logos or branding as its own.
