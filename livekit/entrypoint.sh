#!/bin/sh
# Starts LiveKit with the settings that depend on this Fly machine.
set -eu

: "${LIVEKIT_API_KEY:?set with fly secrets}"
: "${LIVEKIT_API_SECRET:?set with fly secrets}"
: "${LIVEKIT_NODE_IP:?the app's dedicated public IPv4, from fly ips list}"
: "${YAP_WEBHOOK_URL:?where to send call join and leave events}"

# Fly only delivers UDP to sockets on the fly-global-services address, and
# replies have to come from it too, so media is limited to that address.
global_ip=$(awk '$2 == "fly-global-services" { print $1; exit }' /etc/hosts)
if [ -z "$global_ip" ]; then
  echo "fly-global-services isn't in /etc/hosts; is this running on Fly?" >&2
  exit 1
fi

cat /etc/livekit.yaml - > /tmp/livekit.yaml <<YAML
rtc:
  # ICE over TCP, for networks that block UDP.
  tcp_port: 7881
  # All media over one UDP port, which is what Fly can route.
  udp_port: 7882
  use_external_ip: false
  ips:
    includes:
      - ${global_ip}/32
webhook:
  api_key: ${LIVEKIT_API_KEY}
  urls:
    - ${YAP_WEBHOOK_URL}
YAML

# The secret goes through the environment, not the config file.
export LIVEKIT_KEYS="${LIVEKIT_API_KEY}: ${LIVEKIT_API_SECRET}"
exec /livekit-server --config /tmp/livekit.yaml --node-ip "$LIVEKIT_NODE_IP"
