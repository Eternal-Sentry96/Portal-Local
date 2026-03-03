#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════╗
# ║                  PORTAL LAUNCHER                             ║
# ║         Local Ollama LLM  ·  ChatGPT-style Web UI            ║
# ╚══════════════════════════════════════════════════════════════╝

set -euo pipefail

# ── Config (override with env vars) ────────────────────────────────────────
PORT="${PORT:-5001}"
# Model is auto-detected from locally installed Ollama models — never hardcoded
OLLAMA_URL="${OLLAMA_URL:-http://localhost:11434}"
BROWSER_OPEN="${BROWSER_OPEN:-true}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Colors ──────────────────────────────────────────────────────────────────
G="\033[38;5;82m"   # green
Y="\033[38;5;226m"  # yellow
R="\033[38;5;196m"  # red
D="\033[38;5;240m"  # dim
B="\033[1m"         # bold
X="\033[0m"         # reset

log()  { echo -e "  ${G}▸${X} $*"; }
warn() { echo -e "  ${Y}⚠${X}  $*"; }
err()  { echo -e "  ${R}✗${X}  $*"; }
sep()  { echo -e "  ${D}────────────────────────────────────────${X}"; }

# ── Banner ──────────────────────────────────────────────────────────────────
echo ""
echo -e "  ${G}${B}╔═══════════════════════════════════════╗${X}"
echo -e "  ${G}${B}║        🌐  PORTAL  —  LOCAL LLM       ║${X}"
echo -e "  ${G}${B}╚═══════════════════════════════════════╝${X}"
echo ""

# ── Dependency checks ────────────────────────────────────────────────────────
sep
log "Checking dependencies..."

# Python
if ! command -v python3 &>/dev/null; then
    err "python3 not found. Install it first."
    exit 1
fi
log "Python3  → $(python3 --version)"

# pip / flask
check_python_pkg() {
    python3 -c "import $1" 2>/dev/null
}

MISSING_PKGS=()
for pkg in flask flask_cors requests; do
    if ! check_python_pkg "$pkg"; then
        MISSING_PKGS+=("$pkg")
    fi
done

if (( ${#MISSING_PKGS[@]} > 0 )); then
    warn "Missing Python packages: ${MISSING_PKGS[*]}"
    log  "Installing via pip..."
    pip3 install --quiet --user "${MISSING_PKGS[@]}" \
        || pip3 install --quiet "${MISSING_PKGS[@]}"
    log  "Packages installed."
fi

# Ollama
if ! command -v ollama &>/dev/null; then
    warn "ollama binary not found in PATH."
    warn "Install from: https://ollama.com/download"
    warn "Continuing anyway — make sure 'ollama serve' is running."
else
    log "Ollama   → $(ollama --version 2>/dev/null | head -1)"
fi

# ── Check if Ollama is running ────────────────────────────────────────────────
sep
log "Checking Ollama service at ${OLLAMA_URL}..."

if curl -sf "${OLLAMA_URL}/api/tags" &>/dev/null; then
    log "Ollama is running ✓"
else
    warn "Ollama does not appear to be running."
    echo ""
    echo -e "  ${Y}Start it in another terminal with:${X}"
    echo -e "  ${B}  ollama serve${X}"
    echo ""
    read -r -p "  Continue anyway? [y/N] " ans
    [[ "${ans,,}" != "y" ]] && exit 1
fi

# ── Kill any existing portal server ──────────────────────────────────────────
sep
log "Checking port ${PORT}..."
if lsof -ti tcp:"${PORT}" &>/dev/null; then
    warn "Port ${PORT} in use — stopping existing process..."
    kill "$(lsof -ti tcp:"${PORT}")" 2>/dev/null || true
    sleep 1
fi

# ── Start Flask server ───────────────────────────────────────────────────────
sep
log "Starting Portal server on port ${PORT}..."

export PORT OLLAMA_URL

python3 "${SCRIPT_DIR}/server.py" &
SERVER_PID=$!

# Wait for server to be ready (up to 10s)
echo -n "  ${D}Waiting for server"
for i in $(seq 1 20); do
    if curl -sf "http://localhost:${PORT}/api/health" &>/dev/null; then
        echo -e "${X}"
        break
    fi
    echo -n "."
    sleep 0.5
done

if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    err "Server failed to start."
    exit 1
fi

log "Server is ready ✓  (PID ${SERVER_PID})"

# ── Open browser ─────────────────────────────────────────────────────────────
URL="http://localhost:${PORT}"

if [[ "${BROWSER_OPEN}" == "true" ]]; then
    sep
    log "Opening browser → ${URL}"
    if command -v xdg-open &>/dev/null; then
        xdg-open "$URL" &>/dev/null &
    elif command -v firefox &>/dev/null; then
        firefox "$URL" &>/dev/null &
    elif command -v chromium-browser &>/dev/null; then
        chromium-browser "$URL" &>/dev/null &
    elif command -v google-chrome &>/dev/null; then
        google-chrome "$URL" &>/dev/null &
    else
        warn "Could not detect a browser. Open manually: ${URL}"
    fi
fi

# ── Running banner ───────────────────────────────────────────────────────────
sep
echo ""
echo -e "  ${G}${B}  Portal is live!${X}"
echo -e "  ${B}  URL    :${X} ${G}${URL}${X}"

echo -e "  ${B}  PID    :${X} ${SERVER_PID}"
echo ""
echo -e "  ${D}Press Ctrl+C to stop.${X}"
echo ""

# ── Trap for clean shutdown ───────────────────────────────────────────────────
cleanup() {
    echo ""
    log "Shutting down Portal (PID ${SERVER_PID})..."
    kill "$SERVER_PID" 2>/dev/null || true
    echo -e "  ${G}Goodbye.${X}"
    exit 0
}
trap cleanup INT TERM

# Keep running and tail server output
wait "$SERVER_PID"
