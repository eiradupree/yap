# Build a static binary (modernc SQLite is pure Go, so no cgo).
FROM golang:1.27.4-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/yapserver . \
 && mkdir -p /out/data

# Minimal runtime: no shell, runs as an unprivileged user.
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/yapserver /yapserver
COPY --from=build --chown=nonroot:nonroot /out/data /data
ENV YAP_DB=/data/yap.db
VOLUME /data
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/yapserver"]
