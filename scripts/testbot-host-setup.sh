#!/usr/bin/env bash
# Idempotently configure testbot's /etc/hosts to short-circuit DNS
# lookups for romerotechsolutions.com / www / api back to localhost.
#
# Why this is needed
# ------------------
# testbot runs the public frontend (nginx → dist/), the public API
# (Node on 127.0.0.1:3001 fronted by nginx), AND a self-monitoring
# rts-agent. The agent is configured with `base_url:
# https://api.romerotechsolutions.com` like every other agent, but
# from testbot itself that hostname resolves to testbot's own
# public IP (54.80.80.123). EC2 instances cannot reach their own
# public IP through Internet Gateway in most VPC configurations
# (hairpin-NAT issue) — packets time out. Without an /etc/hosts
# override, testbot's self-monitoring agent hangs on every API
# call, and any deploy-verification curl from testbot does the same.
#
# This script adds a marker block routing the three public
# hostnames at 127.0.0.1, so all three resolve to the local nginx
# (which still terminates TLS on the loopback interface and
# proxies to the backend on 127.0.0.1:3001 normally). The TLS cert
# is bound to the hostname not the IP, so it still validates.
#
# Run with:
#   sudo ./scripts/testbot-host-setup.sh
#
# Idempotent — second invocation is a no-op. Re-run after a fresh
# testbot rebuild or any /etc/hosts wipe.

set -euo pipefail

HOSTS_FILE=/etc/hosts
MARKER="# rts-testbot self-loopback (added by scripts/testbot-host-setup.sh)"

ENTRIES=(
    "127.0.0.1 api.romerotechsolutions.com"
    "127.0.0.1 romerotechsolutions.com www.romerotechsolutions.com"
    # MeshCentral server is fronted by the same nginx on testbot.
    # Required for the backend's getLoginCookie() WebSocket call
    # which is invoked when a technician starts a remote-control
    # session via the legacy MeshAgent path.
    "127.0.0.1 mesh.romerotechsolutions.com"
)

if [ "$(id -u)" -ne 0 ]; then
    echo "✗ Must run as root (use sudo)." >&2
    exit 1
fi

# Check which entries are already present (by exact line match) so
# we can do a partial-add when the marker block is there but is
# missing newer hostnames added in a later script revision.
missing=()
for e in "${ENTRIES[@]}"; do
    if ! grep -qxF "$e" "$HOSTS_FILE"; then
        missing+=("$e")
    fi
done

if [ ${#missing[@]} -eq 0 ]; then
    echo "✓ All testbot self-loopback entries already in $HOSTS_FILE; nothing to do."
    exit 0
fi

# First run: write the full marker block.
# Subsequent runs (block exists, missing newer entries): append the
# missing entries directly after the marker line so the block stays
# contiguous.
if ! grep -qF "$MARKER" "$HOSTS_FILE"; then
    {
        echo ""
        echo "$MARKER"
        for e in "${ENTRIES[@]}"; do echo "$e"; done
    } >> "$HOSTS_FILE"
    echo "✓ Wrote testbot self-loopback block to $HOSTS_FILE:"
    for e in "${ENTRIES[@]}"; do echo "  $e"; done
else
    # awk to insert each missing line right after the marker line.
    tmp=$(mktemp)
    awk -v marker="$MARKER" -v lines="$(printf '%s\n' "${missing[@]}")" '
        $0 == marker { print; print lines; next }
        { print }
    ' "$HOSTS_FILE" > "$tmp"
    cat "$tmp" > "$HOSTS_FILE"
    rm -f "$tmp"
    echo "✓ Patched testbot self-loopback block in $HOSTS_FILE with new entries:"
    for e in "${missing[@]}"; do echo "  $e"; done
fi

echo ""
echo "Verify with:"
echo "  curl -sS -o /dev/null -w 'HTTP %{http_code} time=%{time_total}s\\n' https://api.romerotechsolutions.com/api/auth/me"
echo "  (expect: HTTP 401 in <50ms; if it hangs the override didn't take effect)"
