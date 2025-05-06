# Babelcast

A server which allows audio publishers to broadcast to subscribers on a channel, using nothing more than a modern web browser.

It uses websockets for signalling & WebRTC for audio.

The designed use case is for live events where language translation is happening.
A translator would act as a publisher and people wanting to hear the translation would be subscribers.

## Developing

Requires Go >= 1.11

```
go run .
```
## Usage

```
Usage of ./babelcast:
  -port int
    	listen on this port (default 8080)
  -webRootPublisher string
    	web root directory for publisher (default "html")
  -webRootSubscriber string
    	web root directory for subscribers (default "html")
```

Users should point their web browser to `http://<server-ip>:8080/static/`

If the `PUBLISHER_PASSWORD` environment variable is set, then publishers will be required to enter the
password before they can connect.

## Usage for LAN broadcasting

getUserMedia() requires a secure connection to be used. otherwise it will return null.

We will use Caddy server to create a local https environment

```
# Run the following commands in two separate terminals
# Windows
./build/babelcast-windows-amd64.exe
./build/caddy_windows_amd64.exe reverse-proxy --from 192.168.70.152:443 --to 127.0.0.1:8080

# Mac
./build/babelcast-darwin-amd64
./build/caddy_darwin_amd64 reverse-proxy --from 192.168.70.152:443 --to 127.0.0.1:8080

# Linux
./build/babelcast-linux-amd64
./build/caddy_linux_amd64 reverse-proxy --from 192.168.70.152:443 --to 127.0.0.1:8080
```

Broadcasters should navigate to `https://<server-ip>/` to start broadcasting

## Docker Setup

Babelcast can be run using Docker Compose, which includes a local STUN server for improved WebRTC connectivity on local networks.

### Prerequisites

- Docker and Docker Compose installed on your system

### Running with Docker Compose

```bash
# Build and start the containers
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the containers
docker-compose down
```

### Architecture

The Docker Compose setup includes:

1. **Babelcast Application**: Your main application server
2. **Local STUN Server**: A coturn-based STUN server for WebRTC connectivity
   - Primary STUN server for local network connections
   - Falls back to Google's public STUN server if needed

This configuration optimizes for local network usage while maintaining fallback capability for more complex network environments.
