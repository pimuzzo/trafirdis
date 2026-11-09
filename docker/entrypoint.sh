#!/bin/sh
set -eu

# Reject credentials and config/JavaScript injection before rendering either file.
# The proxy target is a fixed HTTP(S) origin; it is never supplied by a request.
PLEX_SERVER_URL=${PLEX_SERVER_URL:-http://192.168.178.46:32400}
if ! printf '%s\n' "$PLEX_SERVER_URL" | grep -Eq '^https?://([A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?|\[[0-9A-Fa-f:]+\])(:[0-9]{1,5})?/?$'; then
    printf '%s\n' 'PLEX_SERVER_URL must be an HTTP(S) origin without credentials, path, query, or fragment.' >&2
    exit 1
fi
# grep processes lines individually; explicitly reject multiline input as well.
plex_carriage_return=$(printf '\r')
case "$PLEX_SERVER_URL" in
    *'
'*|*"$plex_carriage_return"*) printf '%s\n' 'PLEX_SERVER_URL must be a single HTTP(S) origin.' >&2; exit 1 ;;
esac
PLEX_SERVER_URL=${PLEX_SERVER_URL%/}
export PLEX_SERVER_URL

TRAFIRDIS_DIAGNOSTICS=${TRAFIRDIS_DIAGNOSTICS:-false}
case "$TRAFIRDIS_DIAGNOSTICS" in
    true|false) ;;
    *) printf '%s\n' 'TRAFIRDIS_DIAGNOSTICS must be true or false.' >&2; exit 1 ;;
esac

envsubst '${PLEX_SERVER_URL}' < /etc/nginx/trafirdis.conf.template > /tmp/trafirdis-nginx.conf
printf 'window.__TRAFIRDIS_CONFIG__ = {"serverUrl":"%s","diagnostics":%s};\n' "$PLEX_SERVER_URL" "$TRAFIRDIS_DIAGNOSTICS" > /tmp/trafirdis-runtime.js
printf '%s\n' 'Starting Trafirdis on port 8080.'
exec nginx -c /tmp/trafirdis-nginx.conf -g 'daemon off;'
