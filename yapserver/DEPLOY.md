# Deploying the Yap server

Yap runs on [Fly.io](https://fly.io) as one small machine with a persistent disk for the SQLite database. Fly provides HTTPS and a `<app>.fly.dev` address.

## Why one machine and not Kubernetes

SQLite is a file on one disk, so only one server process can own it, and a cluster would add cost and moving parts without adding capacity. One machine is far more than an early-stage team needs (see [Capacity](#capacity)). Once Yap needs more than one machine, for redundancy or scale, switch storage to Postgres, run several instances, and fan live events out through Postgres `LISTEN/NOTIFY` or Redis. That's the point where Kubernetes, or Fly with several machines, starts to make sense.

## First deploy

Run these from `yapserver/` after `fly auth login`:

```bash
fly apps create <app-name>                    # globally unique, e.g. yap-yourteam
sed -i '' 's/^app = .*/app = "<app-name>"/' fly.toml
fly volumes create yap_data --region ord --size 1 --yes
fly secrets set YAP_INVITE_CODE="$(openssl rand -base64 18 | tr -d '/+=')" --stage
fly deploy --ha=false
```

`--ha=false` keeps it to one machine, because a second one would get its own empty database. Then open `https://<app-name>.fly.dev`.

## Everyday operations

| Task | Command |
| --- | --- |
| Deploy a new version | `fly deploy` |
| Logs | `fly logs` |
| Status and health checks | `fly status`, `fly checks list` |
| Change the invite code | `fly secrets set YAP_INVITE_CODE=new-code` (restarts the server; existing accounts are unaffected) |
| Open sign-up to anyone | `fly secrets unset YAP_INVITE_CODE` |
| Bigger machine | `fly scale vm shared-cpu-2x` or `fly scale memory 512` |
| Bigger disk | `fly volumes extend <volume-id> --size 5` |

You can read the current invite code only from inside the machine (`fly ssh console` doesn't work because the image has no shell). Keep a copy somewhere safe when you set it, or set a new one.

## Backups

Fly takes daily snapshots of the volume and keeps them for 5 days (`fly volumes snapshots list <volume-id>`). To restore one, create a new volume from it with `fly volumes create yap_data --snapshot-id <id>` and redeploy. For off-site copies, add a backup job such as [Litestream](https://litestream.io) streaming to S3-compatible storage.

## Custom domain

```bash
fly certs add chat.example.com
```

Then create the DNS records that command prints. Fly issues the HTTPS certificate on its own.

## Settings

| Env var or flag | Fly value | Meaning |
| --- | --- | --- |
| `YAP_SECURE_COOKIES` / `-secure-cookies` | `true` | Session cookies only over HTTPS |
| `YAP_BEHIND_PROXY` / `-behind-proxy` | `true` | Take client IPs from Fly's `X-Forwarded-For` for rate limiting |
| `YAP_INVITE_CODE` (secret, env only) | set | Required to create an account |
| `YAP_DB` / `-db` | `/data/yap.db` | Database path, on the volume |
| `PORT` / `-addr` | `8080` | Listen port |

## Capacity

Measured with the Docker image capped at 1 CPU and 256 MB, the same size as the Fly VM:

| Load | Send latency p50 / p99 | Live delivery | Memory |
| --- | --- | --- | --- |
| 500 users, 1,000 open tabs, 25 messages/s | 2.4 ms / 7.9 ms | 100% (25,000/s) | under 40 MB |
| 200 users, 400 tabs, 200 messages/s, all in one channel | 1 ms / 58 ms | 100% (80,000/s) | under 40 MB |

The second row is far beyond normal team chat and saturates the CPU. If that ever happens, `fly scale vm shared-cpu-2x` is the first step.

## Limits built in

- Sign-in and sign-up: 10 attempts per IP, then 1 every 6 seconds.
- Messages: a burst of 20 per user, then 2 per second.
- Channel creation: a burst of 5 per user, then 1 every 30 seconds.
- 10 open live connections (tabs) per user.
- Request bodies are capped at 64 KB and messages at 4,000 characters.
