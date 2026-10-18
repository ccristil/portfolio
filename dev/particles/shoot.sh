#!/usr/bin/env bash
# Screenshots a page at one or more ?stage= values with headless Chrome.
# Thin wrapper around shoot.mjs (Chrome DevTools protocol, needs Node 22+).
# Needs the dev server: python3 -m http.server 8765 --bind 127.0.0.1 (repo root).
#
# Usage: dev/particles/shoot.sh <page path> <out dir> <WxH> <stage> [<stage> ...]
# Example: dev/particles/shoot.sh dev/index_v5.html /tmp/shots 1280,800 0 1 4
# Size is W,H. Headless Chrome won't go narrower than ~500px by itself, but
# shoot.mjs overrides the device metrics, so 390,844 also works.
# Extra Chrome flags can be passed via CHROME_FLAGS, e.g.
#   CHROME_FLAGS=--force-prefers-reduced-motion dev/particles/shoot.sh ...
# SHOOT_BASE overrides the server URL (default http://127.0.0.1:8765).
# Exits non-zero if any stage failed. Blocks analytics requests while shooting.
set -euo pipefail
exec node "$(dirname "$0")/shoot.mjs" "$@"
