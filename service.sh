#!/bin/bash

# Romero Tech Solutions Service Manager
# Mirrors the interface used by ~/worship-setlist/service.sh, ~/funder-finder/service.sh,
# and ~/tampa-re-investor/service.sh — same commands, same flag shape.
#
# Unlike worship-setlist, this project's frontend lives on AWS Amplify
# (https://romerotechsolutions.com via Amplify CDN), not on this host. Only the
# backend (api.romerotechsolutions.com → 127.0.0.1:3001) runs on testbot. Dev mode
# is therefore not a toggle on this host — the script accepts --prod for parity
# with sister projects, and --dev is a no-op that points you at the local dev
# workflow on your laptop.
#
# Usage: ./service.sh [start|stop|restart|build|status|logs]
#        ./service.sh restart --prod [--force]

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
    echo -e "Mode:     ${GREEN}${mode^^}${NC} (backend on testbot; frontend on AWS Amplify)"
    echo -e "URLs:     https://romerotechsolutions.com (Amplify)"
    echo -e "          https://api.romerotechsolutions.com (this host, port ${BACKEND_PORT})"
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
    echo -e "Frontend: AWS Amplify (deploy via git push to main; not managed here)"

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
        echo -e "${GREEN}Backend started — frontend served by AWS Amplify${NC}"
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
        for arg in "$@"; do
            case "$arg" in
                --dev)
                    echo -e "${YELLOW}--dev is not applicable on this host — frontend is on AWS Amplify.${NC}"
                    echo -e "${YELLOW}Run \`npm run dev\` on your laptop to develop locally.${NC}"
                    exit 0
                    ;;
                --prod)      TARGET_MODE="prod" ;;
                --force)     FORCE=true ;;
                *)
                    echo -e "${RED}Unknown flag: $arg${NC}"
                    exit 1
                    ;;
            esac
        done

        if [ -z "$TARGET_MODE" ]; then
            echo -e "${RED}restart requires --prod${NC}"
            echo "Usage: $0 restart --prod [--force]"
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
        echo -e "${GREEN}Romero Tech Solutions restarted${NC}"
        ;;

    build)
        echo -e "${YELLOW}========================================${NC}"
        echo -e "${YELLOW}  Backend deps install (no frontend build on testbot)${NC}"
        echo -e "${YELLOW}========================================${NC}"
        echo ""
        echo -e "${BLUE}Running: cd backend && npm install --omit=dev${NC}"
        (cd "${BACKEND_DIR}" && npm install --omit=dev) || {
            echo -e "${RED}npm install failed${NC}"
            exit 1
        }
        echo ""
        echo -e "${GREEN}Backend deps installed${NC}"
        echo -e "${YELLOW}Frontend build is handled by AWS Amplify on git push.${NC}"
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
        echo "  start                   Start backend"
        echo "  stop                    Stop backend"
        echo "  restart --prod          Restart backend"
        echo "  restart --prod --force  Restart even if a foreign process holds the port"
        echo "  build                   npm install backend deps (--omit=dev)"
        echo "  status                  Show service status + port-collision check"
        echo "  logs                    Show recent backend logs"
        echo "  setup-nginx             (no-op; nginx config is hand-managed)"
        echo ""
        echo "Notes:"
        echo "  - Backend port: ${BACKEND_PORT}"
        echo "  - Frontend lives on AWS Amplify, deployed via git push to main."
        echo "  - --dev is not applicable on this host (run \`npm run dev\` locally)."
        echo ""
        echo "Sister-project port map (for collision awareness):"
        echo -e "$SISTER_PORTS_DOC"
        echo ""
        exit 1
        ;;
esac
