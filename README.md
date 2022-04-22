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
./caddy reverse-proxy --from <server-ip>:443 --to 127.0.0.1:8080
```

Broadcasters should navigate to `https://<server-ip>/` to start broadcasting
