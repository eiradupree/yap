# LiveKit media server for Yap calls. Pinned by digest; this is v1.13.11.
FROM livekit/livekit-server:v1.13.11@sha256:25cd902de7cacbd5f1f779f6a6ac1eae20ba8f56b0935934ce6b0ab80d1e3d20
COPY livekit.yaml /etc/livekit.yaml
COPY entrypoint.sh /entrypoint.sh
USER nobody
ENTRYPOINT ["/bin/sh", "/entrypoint.sh"]
