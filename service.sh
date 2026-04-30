#!/bin/bash

# Romero Tech Solutions Service Manager
# Mirrors the interface used by ~/worship-setlist/service.sh, ~/funder-finder/service.sh,
# and ~/tampa-re-investor/service.sh — same commands, same flag shape.
#
# Post-cutover (2026-04-24) this host runs BOTH the frontend and the backend:
#   - nginx serves the Vite-built dist/ for romerotechsolutions.com (+ www)
#   - nginx proxies api.romerotechsolutions.com → 127.0.0.1:3001 (Node backend)
# So `build` rebuilds dist/, and `restart --prod` rebuilds dist/ + restarts the
# backend systemd unit. Dev mode (Vite HMR) is a laptop-only thing — the --dev
# flag is accepted for sister-script parity and points the user at npm run dev.
#
# Usage: ./service.sh [start|stop|restart|build|status|logs]
#        ./service.sh restart --prod [--force]                  (legacy testbot in-place — rollback only)
#        ./service.sh restart --prod --from-local [--no-backend-deps]  (laptop → fedora.local; the prod path)
#
# --from-local mode (laptop → fedora.local):
#   The build runs on your laptop (~10s on M1). Then dist/ is rsynced to
#   fedora.local (which serves prod via Cloudflare Tunnel since 2026-04-29)
#   and the backend is restarted via the user-level systemd unit.
#
#   The pre-2026-04-29 testbot path remains as a rollback only — see
#   ~/.claude/CLAUDE.md "FEDORA.LOCAL" section for the fallback DNS flip.
#
#   Requires: laptop = Darwin; ssh fedora.local configured; clean git state.

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Directories
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="${SCRIPT_DIR}/backend"

# Service names (for systemd)
BACKEND_SERVICE="romero-tech-solutions-backend"

# Ports (declared so foreign collisions are auditable across all sister scripts)
BACKEND_PORT=3001

# Nginx config
NGINX_CONF="/etc/nginx/conf.d/romerotechsolutions.conf"

# --from-local mode targets
PROD_SSH_HOST="fedora.local"
PROD_REMOTE_DIR="/home/louis/romero-tech-solutions"
PROD_BACKEND_BOX="rts-box"   # distrobox name on fedora that runs the backend
# Systemd user-level unit names on fedora.local (no sudo).
PROD_SERVICE_BACKEND="rts"
PROD_SERVICE_FRONTEND="rts-frontend"

# ── Sister-project port awareness ──────────────────────────────────
# Used by start/restart to refuse if our port is held by something we don't own.
SISTER_PORTS_DOC="\
  3001 = romero-tech-solutions
  3002 = funder-finder
  3003 = worship-setlist
  3004 = tampa-re-investor (Coastly)"

# ── Helpers ────────────────────────────────────────────────────────

is_service_running() {
    systemctl is-active --quiet "$1" 2>/dev/null
    return $?
}

# True if our backend port is held by a process that's NOT our systemd unit.
foreign_holds_backend_port() {
    local our_pid
    our_pid=$(systemctl show "$BACKEND_SERVICE" --no-page -p MainPID --value 2>/dev/null || echo "0")
    local holders
    holders=$(sudo ss -tlnp 2>/dev/null | awk -v p=":${BACKEND_PORT}" '$4 ~ p' | grep -oE 'pid=[0-9]+' | grep -oE '[0-9]+' | sort -u)
    if [ -z "$holders" ]; then
        return 1   # nothing on the port
    fi
    for pid in $holders; do
        if [ "$pid" != "$our_pid" ]; then
            echo "$pid"
            return 0
        fi
    done
    return 1
}

ensure_service_exists() {
    local service=$1
    if [ ! -f "/etc/systemd/system/${service}.service" ]; then
        echo -e "${YELLOW}Creating systemd service: ${service}${NC}"
        sudo tee "/etc/systemd/system/${service}.service" > /dev/null <<UNIT
[Unit]
Description=Romero Tech Solutions Backend (Express + Node)
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
User=ec2-user
Group=ec2-user
WorkingDirectory=${BACKEND_DIR}
EnvironmentFile=${BACKEND_DIR}/.env
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=rts-backend

NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
UNIT
        sudo systemctl daemon-reload
    fi
}

reload_nginx() {
    if sudo nginx -t 2>&1; then
        sudo systemctl reload nginx
        return 0
    else
        echo -e "${RED}Nginx config test failed!${NC}"
        return 1
    fi
}

# ── --from-local deploy (laptop → fedora.local) ────────────────────

is_darwin() {
    [ "$(uname -s)" = "Darwin" ]
}

deploy_from_local() {
    local skip_backend_deps="$1"

    if ! is_darwin; then
        echo -e "${RED}--from-local must be run from your laptop (Darwin), not on the prod host.${NC}"
        echo -e "${YELLOW}Drop --from-local to use the in-place restart on this host.${NC}"
        exit 1
    fi

    # Verify clean git + in-sync with origin so the prod host's `git pull`
    # matches what we built. A drift here would let prod run code that
    # doesn't match the dist we shipped.
    if ! git -C "$SCRIPT_DIR" diff --quiet || ! git -C "$SCRIPT_DIR" diff --quiet --staged; then
        echo -e "${RED}Working tree has uncommitted changes.${NC}"
        echo -e "${YELLOW}Commit + push before --from-local — $PROD_SSH_HOST pulls from origin.${NC}"
        git -C "$SCRIPT_DIR" status --short
        exit 1
    fi
    git -C "$SCRIPT_DIR" fetch --quiet origin main
    local local_sha remote_sha
    local_sha=$(git -C "$SCRIPT_DIR" rev-parse HEAD)
    remote_sha=$(git -C "$SCRIPT_DIR" rev-parse origin/main)
    if [ "$local_sha" != "$remote_sha" ]; then
        echo -e "${RED}HEAD ($local_sha) is not at origin/main ($remote_sha).${NC}"
        echo -e "${YELLOW}Push your branch first so $PROD_SSH_HOST's git pull lands the same commit.${NC}"
        exit 1
    fi

    # Verify SSH connectivity before doing the expensive build.
    if ! ssh -o ConnectTimeout=5 -o BatchMode=yes "$PROD_SSH_HOST" 'echo ok' >/dev/null 2>&1; then
        echo -e "${RED}Cannot reach $PROD_SSH_HOST via ssh.${NC}"
        echo -e "${YELLOW}Check your ~/.ssh/config and network.${NC}"
        exit 1
    fi

    # CRITICAL: pull prod's .env.production into the project root so
    # `npm run build` bakes the right VITE_* values into the bundle. Without
    # this, the laptop's `.env` (which points VITE_API_BASE_URL at localhost
    # for dev) would get embedded — yielding a dist that "loads" but every
    # API call hits the user's own machine. Production users see "Connection
    # Error: Unable to connect to the backend server."
    #
    # We re-pull each deploy so the local copy stays in sync with prod
    # if secrets / Cognito IDs are rotated. The file is gitignored.
    echo -e "${BLUE}Step 1/6: pull .env.production from $PROD_SSH_HOST...${NC}"
    scp -q "$PROD_SSH_HOST:$PROD_REMOTE_DIR/.env.production" "$SCRIPT_DIR/.env.production" || {
        echo -e "${RED}scp .env.production failed${NC}"; exit 1
    }
    if ! grep -q "VITE_API_BASE_URL=https://api\.romerotechsolutions\.com" "$SCRIPT_DIR/.env.production"; then
        echo -e "${RED}prod's .env.production does NOT have a prod API URL.${NC}"
        echo -e "${YELLOW}Investigate before continuing — building from this would ship a broken bundle.${NC}"
        exit 1
    fi

    echo -e "${BLUE}Step 2/6: building dist/ locally...${NC}"
    (cd "$SCRIPT_DIR" && npm ci --no-audit --no-fund) || {
        echo -e "${RED}npm ci failed${NC}"; exit 1
    }
    (cd "$SCRIPT_DIR" && npm run build) || {
        echo -e "${RED}npm run build failed${NC}"; exit 1
    }

    # Belt + suspenders: verify the built bundle actually embeds the prod
    # API URL. If env loading misbehaves for any reason, this catches it
    # at the artifact level before we rsync a broken bundle to prod.
    if ! grep -q "https://api\.romerotechsolutions\.com/api" "$SCRIPT_DIR"/dist/js/index-*.js 2>/dev/null; then
        echo -e "${RED}Built bundle does NOT contain the prod API URL.${NC}"
        echo -e "${YELLOW}Refusing to deploy — would brick the dashboard for all users.${NC}"
        echo -e "${YELLOW}Check: grep VITE_API_BASE_URL .env.production${NC}"
        exit 1
    fi

    echo -e "${BLUE}Step 3/6: pulling latest on $PROD_SSH_HOST...${NC}"
    ssh "$PROD_SSH_HOST" "cd $PROD_REMOTE_DIR && git pull --ff-only origin main" || {
        echo -e "${RED}git pull on $PROD_SSH_HOST failed${NC}"; exit 1
    }

    echo -e "${BLUE}Step 4/6: rsync dist/ to $PROD_SSH_HOST...${NC}"
    rsync -az --delete \
        --exclude='.DS_Store' \
        "$SCRIPT_DIR/dist/" \
        "$PROD_SSH_HOST:$PROD_REMOTE_DIR/dist/" || {
        echo -e "${RED}rsync failed${NC}"; exit 1
    }

    # Backend npm ci runs INSIDE the rts-box distrobox where node_modules
    # are bound. Running on the host would scatter native bindings across
    # incompatible filesystems.
    if [ "$skip_backend_deps" != "true" ]; then
        echo -e "${BLUE}Step 5/6: backend npm ci inside $PROD_BACKEND_BOX (idempotent if no changes)...${NC}"
        ssh "$PROD_SSH_HOST" "distrobox enter $PROD_BACKEND_BOX -- bash -c 'cd $PROD_REMOTE_DIR/backend && npm ci --no-audit --no-fund'" || {
            echo -e "${RED}backend npm ci failed${NC}"; exit 1
        }
    else
        echo -e "${YELLOW}Step 5/6: skipping backend npm ci (--no-backend-deps).${NC}"
    fi

    # User-level systemd on fedora — no sudo. Restart both backend and the
    # static-frontend server so a new dist/ is reloaded immediately.
    echo -e "${BLUE}Step 6/6: restart $PROD_SERVICE_BACKEND + $PROD_SERVICE_FRONTEND on $PROD_SSH_HOST...${NC}"
    ssh "$PROD_SSH_HOST" "systemctl --user restart $PROD_SERVICE_BACKEND $PROD_SERVICE_FRONTEND" || {
        echo -e "${RED}service restart failed${NC}"; exit 1
    }

    # Poll /api/health until it returns 200 or we hit max attempts. Node
    # initialization (DB pool, WebSocket, scheduler service) routinely takes
    # 5-10s; a fixed sleep is brittle. Retry every 2s for up to 30s.
    echo -e "${BLUE}Verifying backend is ready...${NC}"
    local attempts=0 max_attempts=15 health_status="000"
    while [ $attempts -lt $max_attempts ]; do
        # Use --fail-with-body OR check exit status separately. Avoid -f
        # which exits non-zero on 5xx and concatenates with the fallback.
        health_status=$(curl -s --max-time 5 -o /dev/null -w "%{http_code}" \
            https://api.romerotechsolutions.com/api/health 2>/dev/null || echo "000")
        if [ "$health_status" = "200" ]; then
            break
        fi
        attempts=$((attempts + 1))
        sleep 2
    done

    local version_json
    version_json=$(curl -s --max-time 10 https://romerotechsolutions.com/version.json 2>/dev/null || echo "ERR")

    echo ""
    if [ "$health_status" = "200" ]; then
        echo -e "${GREEN}Deploy complete.${NC}"
    else
        echo -e "${RED}Deploy completed but backend health check failed.${NC}"
    fi
    echo -e "  Frontend version.json: $version_json"
    echo -e "  Backend /api/health:   HTTP $health_status (after $((attempts * 2))s wait)"

    if [ "$health_status" != "200" ]; then
        echo -e "${RED}Investigate:${NC}"
        echo -e "  ssh $PROD_SSH_HOST 'journalctl --user -u $PROD_SERVICE_BACKEND -n 50 --no-pager'"
        exit 1
    fi
}

# ── Mode (read-only on this host — backend is always prod here) ────

get_current_mode() {
    if [ ! -f "$NGINX_CONF" ]; then
        echo "unknown"
        return
    fi
    # Treat nginx as 'prod' if any proxy_pass in this config points at our backend port.
    if sudo grep -qE "proxy_pass http://127\.0\.0\.1:${BACKEND_PORT};" "$NGINX_CONF" 2>/dev/null; then
        echo "prod"
    else
        echo "unknown"
    fi
}

# ── Lifecycle ──────────────────────────────────────────────────────

start_backend() {
    echo -e "${BLUE}Starting backend...${NC}"
    ensure_service_exists "$BACKEND_SERVICE"

    if is_service_running "$BACKEND_SERVICE"; then
        echo -e "${YELLOW}Backend is already running${NC}"
        return 0
    fi

    local foreign_pid
    if foreign_pid=$(foreign_holds_backend_port); then
        echo -e "${RED}Port ${BACKEND_PORT} is held by PID ${foreign_pid} (not ${BACKEND_SERVICE}).${NC}"
        echo -e "${YELLOW}Sister-project port map:${NC}"
        echo -e "$SISTER_PORTS_DOC"
        echo -e "${YELLOW}Refusing to start. Investigate with: sudo ss -tlnp | grep :${BACKEND_PORT}${NC}"
        return 1
    fi

    sudo systemctl start "$BACKEND_SERVICE"
    sleep 2

    if is_service_running "$BACKEND_SERVICE"; then
        echo -e "${GREEN}Backend started${NC}"
        echo -e "${GREEN}  API: https://api.romerotechsolutions.com/${NC}"
        echo -e "${GREEN}  Logs: sudo journalctl -u ${BACKEND_SERVICE} -f${NC}"
    else
        echo -e "${RED}Backend failed to start${NC}"
        echo -e "${YELLOW}Check logs: sudo journalctl -u ${BACKEND_SERVICE} -n 50${NC}"
        return 1
    fi
}

stop_backend() {
    echo -e "${BLUE}Stopping backend...${NC}"
    if ! is_service_running "$BACKEND_SERVICE"; then
        echo -e "${YELLOW}Backend is not running${NC}"
        return 0
    fi
    sudo systemctl stop "$BACKEND_SERVICE"
    sleep 1
    echo -e "${GREEN}Backend stopped${NC}"
}

# ── Status / logs ──────────────────────────────────────────────────

show_status() {
    echo -e "${BLUE}=== Romero Tech Solutions Status ===${NC}"
    echo ""

    local mode
    mode=$(get_current_mode)
    echo -e "Mode:     ${GREEN}${mode^^}${NC} (frontend dist/ + backend both served from this host)"
    echo -e "URLs:     https://romerotechsolutions.com (nginx → dist/)"
    echo -e "          https://api.romerotechsolutions.com (nginx → port ${BACKEND_PORT})"
    echo ""

    echo -n "Backend:  "
    if is_service_running "$BACKEND_SERVICE"; then
        echo -e "${GREEN}RUNNING${NC} (port ${BACKEND_PORT})"
    else
        echo -e "${RED}STOPPED${NC}"
    fi

    local foreign_pid
    if foreign_pid=$(foreign_holds_backend_port); then
        echo ""
        echo -e "${RED}WARNING: Port ${BACKEND_PORT} is held by PID ${foreign_pid} (foreign to ${BACKEND_SERVICE}).${NC}"
        echo -e "${YELLOW}Investigate:${NC} sudo ss -tlnp | grep :${BACKEND_PORT}"
    fi

    echo ""
    echo -e "Nginx:    ${NGINX_CONF}"
    if [ -d "${SCRIPT_DIR}/dist" ]; then
        local dist_size
        dist_size=$(du -sh "${SCRIPT_DIR}/dist" 2>/dev/null | cut -f1)
        local dist_mtime
        dist_mtime=$(stat -c %y "${SCRIPT_DIR}/dist/index.html" 2>/dev/null | cut -d. -f1 || echo unknown)
        echo -e "Frontend: ${SCRIPT_DIR}/dist (${dist_size}, built ${dist_mtime})"
    else
        echo -e "Frontend: ${RED}dist/ missing${NC} — run \`./service.sh build\` to populate"
    fi

    echo ""
    echo -e "${BLUE}Detailed status:${NC}"
    echo ""
    sudo systemctl status "$BACKEND_SERVICE" --no-pager -l 2>/dev/null || echo "  (service not created yet)"
}

show_logs() {
    echo -e "${BLUE}=== Recent Logs ===${NC}"
    echo ""

    echo -e "${YELLOW}Backend (last 30 lines):${NC}"
    sudo journalctl -u "$BACKEND_SERVICE" -n 30 --no-pager 2>/dev/null || echo "  No logs available"
    echo ""

    echo -e "${BLUE}Follow logs:${NC}"
    echo "  sudo journalctl -u ${BACKEND_SERVICE} -f"
}

# ── Main ───────────────────────────────────────────────────────────

case "${1:-}" in
    start)
        echo -e "${GREEN}========================================${NC}"
        echo -e "${GREEN}  Starting Romero Tech Solutions${NC}"
        echo -e "${GREEN}========================================${NC}"
        echo ""
        start_backend
        echo ""
        echo -e "${GREEN}Backend started. Frontend dist/ is served by nginx; rebuild with \`./service.sh build\`.${NC}"
        ;;

    stop)
        echo -e "${RED}========================================${NC}"
        echo -e "${RED}  Stopping Romero Tech Solutions${NC}"
        echo -e "${RED}========================================${NC}"
        echo ""
        stop_backend
        ;;

    restart)
        shift
        TARGET_MODE=""
        FORCE=false
        FROM_LOCAL=false
        SKIP_BACKEND_DEPS=false
        for arg in "$@"; do
            case "$arg" in
                --dev)
                    echo -e "${YELLOW}--dev is not applicable here — run \`npm run dev\` on your laptop for HMR.${NC}"
                    exit 0
                    ;;
                --prod)              TARGET_MODE="prod" ;;
                --force)             FORCE=true ;;
                --from-local)        FROM_LOCAL=true ;;
                --no-backend-deps)   SKIP_BACKEND_DEPS=true ;;
                *)
                    echo -e "${RED}Unknown flag: $arg${NC}"
                    exit 1
                    ;;
            esac
        done

        if [ -z "$TARGET_MODE" ]; then
            echo -e "${RED}restart requires --prod${NC}"
            echo "Usage: $0 restart --prod [--force]                          (legacy testbot in-place — rollback only)"
            echo "       $0 restart --prod --from-local [--no-backend-deps]   (laptop → fedora.local; the prod path)"
            exit 1
        fi

        # Laptop → fedora.local path: build local, rsync, restart remotely.
        if [ "$FROM_LOCAL" = true ]; then
            echo -e "${YELLOW}========================================${NC}"
            echo -e "${YELLOW}  Deploy from laptop → $PROD_SSH_HOST${NC}"
            echo -e "${YELLOW}========================================${NC}"
            deploy_from_local "$SKIP_BACKEND_DEPS"
            exit $?
        fi

        # In-place path is the legacy testbot flow (sudo + systemctl). It's
        # kept around as a rollback target while testbot remains as warm
        # standby (per ~/.claude/CLAUDE.md FEDORA.LOCAL section). Refuse to
        # run from the laptop.
        if is_darwin; then
            echo -e "${RED}restart --prod (in-place) is the legacy testbot flow.${NC}"
            echo -e "${YELLOW}For prod deploys use:  $0 restart --prod --from-local${NC}"
            echo -e "${YELLOW}For testbot rollback:  ssh testbot 'cd ~/romero-tech-solutions && ./service.sh restart --prod'${NC}"
            exit 1
        fi

        echo -e "${YELLOW}========================================${NC}"
        echo -e "${YELLOW}  Restarting Romero Tech Solutions (prod)${NC}"
        echo -e "${YELLOW}========================================${NC}"
        echo ""

        ensure_service_exists "$BACKEND_SERVICE"

        # Refuse if a foreign process holds our port (don't trample sister projects).
        local_holds=$(foreign_holds_backend_port || true)
        if [ -n "$local_holds" ] && [ "$FORCE" != true ]; then
            echo -e "${RED}Port ${BACKEND_PORT} held by foreign PID ${local_holds}.${NC}"
            echo -e "${YELLOW}Sister-project port map:${NC}"
            echo -e "$SISTER_PORTS_DOC"
            echo -e "${YELLOW}Re-run with --force only if you're sure.${NC}"
            exit 1
        fi

        echo -e "${BLUE}Installing backend deps...${NC}"
        (cd "${BACKEND_DIR}" && npm install --no-audit --no-fund) || {
            echo -e "${RED}backend npm install failed${NC}"
            exit 1
        }

        echo -e "${BLUE}Installing frontend deps...${NC}"
        (cd "${SCRIPT_DIR}" && npm install --no-audit --no-fund) || {
            echo -e "${RED}frontend npm install failed${NC}"
            exit 1
        }

        echo -e "${BLUE}Building frontend dist/...${NC}"
        (cd "${SCRIPT_DIR}" && npm run build) || {
            echo -e "${RED}frontend build failed${NC}"
            exit 1
        }

        echo -e "${BLUE}Restarting backend...${NC}"
        sudo systemctl restart "$BACKEND_SERVICE"
        sleep 2
        if is_service_running "$BACKEND_SERVICE"; then
            echo -e "${GREEN}Backend restarted${NC}"
        else
            echo -e "${RED}Backend failed to restart${NC}"
            echo -e "${YELLOW}Check: sudo journalctl -u ${BACKEND_SERVICE} -n 50${NC}"
            exit 1
        fi

        echo ""
        echo -e "${GREEN}Romero Tech Solutions restarted (frontend rebuilt + backend up)${NC}"
        ;;

    build)
        echo -e "${YELLOW}========================================${NC}"
        echo -e "${YELLOW}  Build (backend deps + frontend dist/)${NC}"
        echo -e "${YELLOW}========================================${NC}"
        echo ""
        echo -e "${BLUE}Backend npm install...${NC}"
        (cd "${BACKEND_DIR}" && npm install --no-audit --no-fund) || {
            echo -e "${RED}backend npm install failed${NC}"
            exit 1
        }
        echo ""
        echo -e "${BLUE}Frontend npm install...${NC}"
        (cd "${SCRIPT_DIR}" && npm install --no-audit --no-fund) || {
            echo -e "${RED}frontend npm install failed${NC}"
            exit 1
        }
        echo ""
        echo -e "${BLUE}Frontend build (npm run build → dist/)...${NC}"
        (cd "${SCRIPT_DIR}" && npm run build) || {
            echo -e "${RED}frontend build failed${NC}"
            exit 1
        }
        echo ""
        echo -e "${GREEN}Build complete. Note: nginx serves dist/ from disk — no restart needed for frontend-only changes.${NC}"
        ;;

    status)
        show_status
        ;;

    logs)
        show_logs
        ;;

    setup-nginx)
        echo -e "${YELLOW}Nginx config for this project is hand-managed at ${NGINX_CONF}.${NC}"
        echo -e "${YELLOW}This script will not regenerate it. Validate with:${NC}"
        echo -e "  sudo nginx -t && sudo systemctl reload nginx"
        ;;

    *)
        echo -e "${BLUE}Romero Tech Solutions Service Manager${NC}"
        echo ""
        echo "Usage: $0 [command]"
        echo ""
        echo "Commands:"
        echo "  start                                 Start backend (legacy testbot in-place)"
        echo "  stop                                  Stop backend (legacy testbot in-place)"
        echo "  restart --prod                        Restart in-place (legacy testbot rollback only)"
        echo "  restart --prod --force                Restart even if a foreign process holds the port"
        echo "  restart --prod --from-local           Build dist on laptop, rsync to fedora.local, restart"
        echo "  restart --prod --from-local --no-backend-deps"
        echo "                                        Same, but skip 'npm ci' inside the rts-box distrobox"
        echo "  build                                 npm install + npm run build (frontend dist/)"
        echo "  status                                Show service status + port-collision check"
        echo "  logs                                  Show recent backend logs"
        echo "  setup-nginx                           (no-op; nginx config is hand-managed)"
        echo ""
        echo "Notes:"
        echo "  - Backend port: ${BACKEND_PORT}"
        echo "  - Frontend dist/ is served by nginx from disk; \`build\` rebuilds it without restarting the backend."
        echo "  - --dev is not applicable on this host (run \`npm run dev\` locally)."
        echo ""
        echo "Sister-project port map (for collision awareness):"
        echo -e "$SISTER_PORTS_DOC"
        echo ""
        exit 1
        ;;
esac
