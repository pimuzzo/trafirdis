#!/bin/sh
set -eu

TRAFIRDIS_DIAGNOSTICS=${TRAFIRDIS_DIAGNOSTICS:-false}
case "$TRAFIRDIS_DIAGNOSTICS" in
    true|false) ;;
    *) printf '%s\n' 'TRAFIRDIS_DIAGNOSTICS must be true or false.' >&2; exit 1 ;;
esac

printf 'window.__TRAFIRDIS_CONFIG__ = {"diagnostics":%s};\n' "$TRAFIRDIS_DIAGNOSTICS" > /tmp/trafirdis-runtime.js
printf '%s\n' 'Starting Trafirdis on port 8080.'
exec nginx -c /etc/nginx/trafirdis.conf -g 'daemon off;'
