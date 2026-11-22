# LiveKit for Yap calls

Voice and video calls in Yap go through [LiveKit](https://livekit.io), an open-source (Apache-2.0) media server. Each channel has one call. Yap's server decides who may join (channel members only) by handing out short-lived LiveKit tokens; browsers then send audio and video to LiveKit, which forwards it to everyone else on the call. LiveKit reports joins and leaves back to Yap through a signed webhook.

This folder deploys LiveKit as its own Fly app, `yap-livekit-712e13`, next to the Yap server.

## Ports

| Port | Protocol | Use |
| --- | --- | --- |
| 443 | HTTPS / WSS | Signaling (`wss://yap-livekit-712e13.fly.dev`), via Fly's proxy to 7880 |
| 7882 | UDP | Media (preferred) |
| 7881 | TCP | Media when a network blocks UDP |

Fly routes UDP only to a dedicated IPv4 address and only to sockets bound to `fly-global-services`. `entrypoint.sh` looks that address up at boot and limits LiveKit's media to it, and `LIVEKIT_NODE_IP` in `fly.toml` must be the app's dedicated IPv4 so browsers know where to send media.

## First deploy

Needs a card on the Fly account: dedicated IPv4 addresses aren't available on the starter credit. From this folder:

```bash
fly apps create yap-livekit-712e13
fly ips allocate-v4 --yes            # dedicated IPv4, about $2 a month
fly ips allocate-v6
fly ips list                         # put the v4 address in fly.toml as LIVEKIT_NODE_IP

# One key and secret, shared by LiveKit and the Yap server. Don't commit them.
KEY="yap$(openssl rand -hex 4)"
SECRET="$(openssl rand -base64 36 | tr -d '/+=')"
fly secrets set LIVEKIT_API_KEY="$KEY" LIVEKIT_API_SECRET="$SECRET" --stage
fly deploy --ha=false

cd ../yapserver
fly secrets set LIVEKIT_URL=wss://yap-livekit-712e13.fly.dev \
  LIVEKIT_API_URL=http://yap-livekit-712e13.internal:7880 \
  LIVEKIT_API_KEY="$KEY" LIVEKIT_API_SECRET="$SECRET"
```

Setting the Yap server's secrets restarts it with calls turned on. To turn calls off again, `fly secrets unset LIVEKIT_URL` on the Yap server.

## Running locally

```bash
docker run --rm -p 7880:7880 -p 7881:7881 -p 7882:7882/udp livekit/livekit-server:v1.13.11 --dev --bind 0.0.0.0 --node-ip 127.0.0.1
# In yapserver/ (dev mode's key is devkey / secret):
LIVEKIT_URL=ws://localhost:7880 LIVEKIT_API_KEY=devkey LIVEKIT_API_SECRET=secret ./yapserver
```

Without the webhook, calls work but the "on a call" banner only updates once a minute (the server also polls LiveKit). For webhooks locally, run LiveKit with a config file that sets `webhook.urls` to `http://host.docker.internal:8080/api/livekit/webhook`.

## Limits and costs

- 50 people per call (`room.max_participants` in `livekit.yaml`).
- One shared-cpu-1x machine with 512 MB handles a few small calls at once. Video forwarding is mostly bandwidth: a 5-person video call uses roughly 10–15 Mbps through the server. Fly bills outbound data at about $0.02 per GB in North America and Europe. Scale with `fly scale vm shared-cpu-2x` or a performance VM.
- No TURN relay yet. A few very strict networks that block both UDP 7882 and TCP 7881 can't connect. LiveKit's built-in TURN on TLS 443 needs its own domain and certificate.
