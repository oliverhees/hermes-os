#!/usr/bin/env bash
#
#  ██╗  ██╗███████╗██████╗ ███╗   ███╗███████╗███████╗      ██████╗ ███████╗
#  ██║  ██║██╔════╝██╔══██╗████╗ ████║██╔════╝██╔════╝     ██╔═══██╗██╔════╝
#  ███████║█████╗  ██████╔╝██╔████╔██║█████╗  ███████╗     ██║   ██║███████╗
#  ██╔══██║██╔══╝  ██╔══██╗██║╚██╔╝██║██╔══╝  ╚════██║     ██║   ██║╚════██║
#  ██║  ██║███████╗██║  ██║██║ ╚═╝ ██║███████╗███████║     ╚██████╔╝███████║
#  ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝╚══════╝╚══════╝      ╚═════╝ ╚══════╝
#
#  Multi-User AI Operating System on top of Hermes Agent
#  https://github.com/oliverhees/hermes-os
#
#  Installs prerequisites (Docker, Compose), generates secrets, configures
#  the stack, and starts hermes-os on a fresh Linux server.
#
#  Usage:
#    ./install.sh                              # interactive
#    ./install.sh --domain=ai.example.com      # pre-set domain
#    ./install.sh --non-interactive           # CI/automation mode
#    ./install.sh --skip-firewall             # don't touch ufw
#    ./install.sh --skip-docker               # assume docker is installed
#    ./install.sh --help
#
#  Tested on: Ubuntu 22.04, Ubuntu 24.04, Debian 12, Pop!_OS 22.04+
#

set -Eeuo pipefail

# ════════════════════════════════════════════════════════════════════
# Constants
# ════════════════════════════════════════════════════════════════════
readonly INSTALLER_VERSION="1.0.0"
readonly MIN_DOCKER_VERSION="24.0.0"
readonly MIN_COMPOSE_VERSION="2.20.0"
readonly LOG_FILE="${HERMES_INSTALL_LOG:-/tmp/hermes-os-install-$(date +%Y%m%d-%H%M%S).log}"
readonly REPO_NAME="hermes-os"

# ════════════════════════════════════════════════════════════════════
# Colors & Symbols (with TTY detection)
# ════════════════════════════════════════════════════════════════════
if [[ -t 1 ]] && [[ "${TERM:-}" != "dumb" ]]; then
  readonly C_RESET=$'\033[0m'
  readonly C_BOLD=$'\033[1m'
  readonly C_DIM=$'\033[2m'
  readonly C_RED=$'\033[31m'
  readonly C_GREEN=$'\033[32m'
  readonly C_YELLOW=$'\033[33m'
  readonly C_BLUE=$'\033[34m'
  readonly C_MAGENTA=$'\033[35m'
  readonly C_CYAN=$'\033[36m'
  readonly C_GRAY=$'\033[90m'
else
  readonly C_RESET="" C_BOLD="" C_DIM="" C_RED="" C_GREEN=""
  readonly C_YELLOW="" C_BLUE="" C_MAGENTA="" C_CYAN="" C_GRAY=""
fi

readonly SYM_OK="${C_GREEN}✓${C_RESET}"
readonly SYM_FAIL="${C_RED}✗${C_RESET}"
readonly SYM_WARN="${C_YELLOW}!${C_RESET}"
readonly SYM_INFO="${C_BLUE}›${C_RESET}"
readonly SYM_ARROW="${C_CYAN}→${C_RESET}"

# ════════════════════════════════════════════════════════════════════
# State
# ════════════════════════════════════════════════════════════════════
INTERACTIVE=1
SKIP_FIREWALL=0
SKIP_DOCKER=0
DOMAIN=""
PUBLIC_IP=""
SUDO=""
OS_FAMILY=""
OS_VERSION=""
TOTAL_STEPS=10
CURRENT_STEP=0

# ════════════════════════════════════════════════════════════════════
# Output helpers
# ════════════════════════════════════════════════════════════════════
log() {
  echo "[$(date '+%H:%M:%S')] $*" >> "$LOG_FILE"
}

banner() {
  cat <<'EOF'

  ┌─────────────────────────────────────────────────────────────┐
  │                                                             │
  │   ██╗  ██╗███████╗██████╗ ███╗   ███╗███████╗███████╗       │
  │   ██║  ██║██╔════╝██╔══██╗████╗ ████║██╔════╝██╔════╝       │
  │   ███████║█████╗  ██████╔╝██╔████╔██║█████╗  ███████╗       │
  │   ██╔══██║██╔══╝  ██╔══██╗██║╚██╔╝██║██╔══╝  ╚════██║       │
  │   ██║  ██║███████╗██║  ██║██║ ╚═╝ ██║███████╗███████║       │
  │   ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝╚══════╝╚══════╝       │
  │                  · O S ·  Installer                          │
  │                                                             │
EOF
  printf "  │   Version %-50s│\n" "$INSTALLER_VERSION"
  printf "  │   Log     %-50s│\n" "$(basename "$LOG_FILE")"
  echo "  │                                                             │"
  echo "  └─────────────────────────────────────────────────────────────┘"
  echo
}

step() {
  CURRENT_STEP=$((CURRENT_STEP + 1))
  echo
  echo -e "${C_BOLD}${C_CYAN}═══ Step ${CURRENT_STEP}/${TOTAL_STEPS} · $1${C_RESET}"
  log "STEP $CURRENT_STEP/$TOTAL_STEPS: $1"
}

info()    { echo -e "  ${SYM_INFO} $*"; log "INFO: $*"; }
ok()      { echo -e "  ${SYM_OK} $*"; log "OK: $*"; }
warn()    { echo -e "  ${SYM_WARN} ${C_YELLOW}$*${C_RESET}"; log "WARN: $*"; }
err()     { echo -e "  ${SYM_FAIL} ${C_RED}$*${C_RESET}" >&2; log "ERROR: $*"; }
dim()     { echo -e "    ${C_DIM}$*${C_RESET}"; }

fatal() {
  err "$1"
  echo
  echo -e "${C_RED}${C_BOLD}Installation aborted.${C_RESET}"
  echo -e "${C_DIM}Full log: $LOG_FILE${C_RESET}"
  exit 1
}

# ════════════════════════════════════════════════════════════════════
# Interactive prompts
# ════════════════════════════════════════════════════════════════════
ask() {
  local prompt="$1" default="${2:-}" reply
  if [[ $INTERACTIVE -eq 0 ]]; then
    echo "$default"
    return
  fi
  if [[ -n "$default" ]]; then
    read -rp "  $prompt [${C_DIM}${default}${C_RESET}]: " reply
    echo "${reply:-$default}"
  else
    read -rp "  $prompt: " reply
    echo "$reply"
  fi
}

ask_yn() {
  local prompt="$1" default="${2:-y}" reply
  if [[ $INTERACTIVE -eq 0 ]]; then
    [[ "$default" == "y" ]] && return 0 || return 1
  fi
  local hint="[Y/n]"
  [[ "$default" == "n" ]] && hint="[y/N]"
  while true; do
    read -rp "  $prompt $hint " reply
    reply="${reply:-$default}"
    case "$reply" in
      [yY]|[yY][eE][sS]) return 0 ;;
      [nN]|[nN][oO]) return 1 ;;
      *) echo "    Please answer y or n." ;;
    esac
  done
}

# ════════════════════════════════════════════════════════════════════
# Error trap
# ════════════════════════════════════════════════════════════════════
on_error() {
  local exit_code=$?
  local line_no=$1
  echo
  err "Unexpected error at line $line_no (exit code $exit_code)."
  err "See log for details: $LOG_FILE"
  exit $exit_code
}
trap 'on_error $LINENO' ERR

# ════════════════════════════════════════════════════════════════════
# Argument parsing
# ════════════════════════════════════════════════════════════════════
show_help() {
  cat <<EOF

${C_BOLD}hermes-os Installer v${INSTALLER_VERSION}${C_RESET}

${C_BOLD}USAGE${C_RESET}
  ./install.sh [OPTIONS]

${C_BOLD}OPTIONS${C_RESET}
  --domain=<fqdn>       Pre-set the domain (skips the interactive prompt)
  --non-interactive     CI mode — uses defaults for all prompts
  --skip-firewall       Don't touch ufw (use if you have another firewall)
  --skip-docker         Assume Docker + Compose are already installed
  --help, -h            Show this message

${C_BOLD}EXAMPLES${C_RESET}
  ${C_DIM}# Interactive on a fresh server${C_RESET}
  sudo ./install.sh

  ${C_DIM}# CI / automated provisioning${C_RESET}
  sudo ./install.sh --domain=ai.example.com --non-interactive

  ${C_DIM}# Local dev (no firewall changes)${C_RESET}
  sudo ./install.sh --domain=localhost --skip-firewall

${C_BOLD}DOCS${C_RESET}
  https://github.com/oliverhees/hermes-os

EOF
}

parse_args() {
  for arg in "$@"; do
    case $arg in
      --domain=*) DOMAIN="${arg#*=}" ;;
      --non-interactive) INTERACTIVE=0 ;;
      --skip-firewall) SKIP_FIREWALL=1 ;;
      --skip-docker) SKIP_DOCKER=1 ;;
      --help|-h) show_help; exit 0 ;;
      *) err "Unknown option: $arg"; show_help; exit 1 ;;
    esac
  done
}

# ════════════════════════════════════════════════════════════════════
# Pre-flight checks
# ════════════════════════════════════════════════════════════════════
check_root() {
  if [[ $EUID -eq 0 ]]; then
    SUDO=""
  elif command -v sudo &>/dev/null; then
    SUDO="sudo"
    info "Running as non-root user — sudo will be used for privileged operations."
    if ! sudo -n true 2>/dev/null; then
      info "sudo may prompt for your password."
    fi
  else
    fatal "This installer needs root privileges. Run as root or install sudo first."
  fi
}

detect_os() {
  if [[ ! -f /etc/os-release ]]; then
    fatal "Cannot detect OS — /etc/os-release missing. Supported: Ubuntu 22+, Debian 12+, Pop!_OS 22+"
  fi
  # shellcheck source=/dev/null
  source /etc/os-release
  OS_FAMILY="${ID_LIKE:-$ID}"
  OS_VERSION="${VERSION_ID:-unknown}"

  case "$ID" in
    ubuntu|debian|pop)
      ok "Detected: ${PRETTY_NAME}"
      ;;
    *)
      if [[ "$OS_FAMILY" == *"debian"* ]] || [[ "$OS_FAMILY" == *"ubuntu"* ]]; then
        warn "Untested OS (${PRETTY_NAME}) but appears Debian-compatible. Continuing."
      else
        fatal "Unsupported OS: ${PRETTY_NAME}. Supported: Ubuntu 22+, Debian 12+, Pop!_OS 22+"
      fi
      ;;
  esac
}

check_repo_location() {
  if [[ ! -f "./docker-compose.yml" ]] || [[ ! -f "./package.json" ]]; then
    fatal "This script must be run from the hermes-os repo root. Current directory: $(pwd)"
  fi
  if ! grep -q "hermes-os" package.json 2>/dev/null && \
     ! grep -q "hermes-workspace" package.json 2>/dev/null; then
    fatal "Does not look like the hermes-os repo. Expected hermes-os or hermes-workspace in package.json."
  fi
  ok "Repository confirmed: $(pwd)"
}

check_min_specs() {
  local mem_mb cpu_count disk_gb
  mem_mb=$(free -m | awk '/^Mem:/ {print $2}')
  cpu_count=$(nproc)
  disk_gb=$(df -BG --output=avail "$PWD" | tail -1 | tr -dc '0-9')

  info "System resources:"
  dim "RAM:  ${mem_mb} MB"
  dim "CPUs: ${cpu_count}"
  dim "Disk: ${disk_gb} GB available"

  if [[ $mem_mb -lt 2048 ]]; then
    warn "RAM below 2 GB — Postgres + hermes-os + agent containers will be tight."
    ask_yn "Continue anyway?" "n" || fatal "Aborted — please upgrade your server."
  fi
  if [[ $disk_gb -lt 20 ]]; then
    warn "Less than 20 GB free — Docker images alone need ~5 GB."
    ask_yn "Continue anyway?" "n" || fatal "Aborted — please free up disk space."
  fi
}

# ════════════════════════════════════════════════════════════════════
# Step 1: System prerequisites
# ════════════════════════════════════════════════════════════════════
install_prerequisites() {
  step "Installing system prerequisites"

  local pkgs=(curl ca-certificates gnupg lsb-release openssl jq git ufw)
  local missing=()
  for pkg in "${pkgs[@]}"; do
    if ! command -v "$pkg" &>/dev/null && ! dpkg -s "$pkg" &>/dev/null 2>&1; then
      missing+=("$pkg")
    fi
  done

  if [[ ${#missing[@]} -eq 0 ]]; then
    ok "All system tools already present."
    return
  fi

  info "Installing: ${missing[*]}"
  $SUDO apt-get update -qq >> "$LOG_FILE" 2>&1
  DEBIAN_FRONTEND=noninteractive $SUDO apt-get install -y -qq "${missing[@]}" >> "$LOG_FILE" 2>&1
  ok "System tools installed."
}

# ════════════════════════════════════════════════════════════════════
# Step 2: Docker
# ════════════════════════════════════════════════════════════════════
install_docker() {
  step "Installing Docker Engine + Compose"

  if [[ $SKIP_DOCKER -eq 1 ]]; then
    info "Skipping Docker install (--skip-docker)"
    if ! command -v docker &>/dev/null; then
      fatal "Docker not found but --skip-docker was passed. Aborting."
    fi
    ok "Docker found: $(docker --version)"
    return
  fi

  if command -v docker &>/dev/null && docker compose version &>/dev/null; then
    ok "Docker already installed: $(docker --version)"
    ok "Compose already installed: $(docker compose version --short)"
    return
  fi

  info "Adding Docker's official GPG key and apt repo..."

  # Docker GPG key
  $SUDO install -m 0755 -d /etc/apt/keyrings
  if [[ ! -f /etc/apt/keyrings/docker.gpg ]]; then
    local docker_id="${ID}"
    [[ "$ID" == "pop" ]] && docker_id="ubuntu"  # Pop!_OS uses Ubuntu's Docker repo
    [[ "$ID" == "linuxmint" ]] && docker_id="ubuntu"

    curl -fsSL "https://download.docker.com/linux/${docker_id}/gpg" | \
      $SUDO gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    $SUDO chmod a+r /etc/apt/keyrings/docker.gpg
  fi

  # Docker apt repo
  local codename
  codename=$(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
  local docker_id="${ID}"
  [[ "$ID" == "pop" ]] && docker_id="ubuntu"
  [[ "$ID" == "linuxmint" ]] && docker_id="ubuntu"

  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/${docker_id} ${codename} stable" | \
    $SUDO tee /etc/apt/sources.list.d/docker.list > /dev/null

  info "Installing docker-ce, docker-ce-cli, containerd, compose-plugin..."
  $SUDO apt-get update -qq >> "$LOG_FILE" 2>&1
  DEBIAN_FRONTEND=noninteractive $SUDO apt-get install -y -qq \
    docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin \
    >> "$LOG_FILE" 2>&1

  $SUDO systemctl enable --now docker >> "$LOG_FILE" 2>&1

  ok "Docker installed: $(docker --version)"
  ok "Compose installed: $(docker compose version --short)"

  # Add invoking user to docker group (only if not root)
  if [[ -n "$SUDO" ]] && [[ -n "${SUDO_USER:-}" ]]; then
    if ! groups "$SUDO_USER" | grep -qw docker; then
      $SUDO usermod -aG docker "$SUDO_USER"
      warn "Added $SUDO_USER to the docker group — log out and back in for it to take effect."
    fi
  fi
}

# ════════════════════════════════════════════════════════════════════
# Step 3: Public IP detection
# ════════════════════════════════════════════════════════════════════
detect_public_ip() {
  step "Detecting public IP"

  local candidates=()
  local ip
  for endpoint in \
    "https://ifconfig.me" \
    "https://api.ipify.org" \
    "https://icanhazip.com"; do
    ip=$(curl -s4 --max-time 5 "$endpoint" 2>/dev/null || true)
    if [[ "$ip" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
      candidates+=("$ip")
    fi
  done

  if [[ ${#candidates[@]} -eq 0 ]]; then
    warn "Could not auto-detect public IP."
    PUBLIC_IP=$(ask "Enter the public IP of this server" "")
    if [[ -z "$PUBLIC_IP" ]]; then
      fatal "Public IP is required for DNS validation in the setup wizard."
    fi
  else
    # Use most common answer
    PUBLIC_IP=$(printf '%s\n' "${candidates[@]}" | sort | uniq -c | sort -rn | head -1 | awk '{print $2}')
    ok "Public IP: ${C_BOLD}${PUBLIC_IP}${C_RESET}"
  fi
}

# ════════════════════════════════════════════════════════════════════
# Step 4: Domain configuration
# ════════════════════════════════════════════════════════════════════
configure_domain() {
  step "Configuring domain"

  if [[ -z "$DOMAIN" ]]; then
    echo
    info "The domain is what your users will type in the browser."
    info "It must point to this server (an A record → ${PUBLIC_IP})."
    info "For local-only testing, use ${C_BOLD}localhost${C_RESET}."
    echo
    DOMAIN=$(ask "Enter your domain (e.g. ai.example.com or localhost)" "localhost")
  fi

  if [[ "$DOMAIN" == "localhost" ]] || [[ "$DOMAIN" == "127.0.0.1" ]]; then
    warn "Using localhost — Caddy will NOT request a Let's Encrypt cert."
    warn "Suitable for development only."
    ok "Domain: ${C_BOLD}localhost${C_RESET}"
    return
  fi

  # Basic FQDN validation
  if [[ ! "$DOMAIN" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ ]]; then
    fatal "Invalid domain format: $DOMAIN"
  fi

  # DNS check
  info "Checking DNS for ${DOMAIN}..."
  local resolved
  resolved=$(getent hosts "$DOMAIN" 2>/dev/null | awk '{print $1}' | head -1 || true)
  if [[ -z "$resolved" ]]; then
    warn "DNS lookup for ${DOMAIN} failed."
    echo
    echo -e "    ${C_YELLOW}You need to set an A record:${C_RESET}"
    echo -e "    ${C_BOLD}${DOMAIN} ${SYM_ARROW} ${PUBLIC_IP}${C_RESET}"
    echo
    if ! ask_yn "Continue anyway? (Let's Encrypt will fail until DNS propagates)" "n"; then
      fatal "Aborted — please configure DNS and re-run."
    fi
  elif [[ "$resolved" != "$PUBLIC_IP" ]]; then
    warn "DNS mismatch: ${DOMAIN} resolves to ${resolved}, expected ${PUBLIC_IP}."
    if ! ask_yn "Continue anyway?" "n"; then
      fatal "Aborted — please fix DNS and re-run."
    fi
  else
    ok "DNS check passed: ${DOMAIN} → ${PUBLIC_IP}"
  fi
}

# ════════════════════════════════════════════════════════════════════
# Step 5: Secrets
# ════════════════════════════════════════════════════════════════════
generate_secrets() {
  step "Generating secrets"

  mkdir -p ./.secrets
  chmod 700 ./.secrets

  local secrets_status=()

  if [[ -f ./.secrets/encryption_key ]]; then
    secrets_status+=("encryption_key: ${C_DIM}preserved${C_RESET}")
  else
    printf '%s' "$(openssl rand -base64 32 | tr -d '\n')" > ./.secrets/encryption_key
    chmod 400 ./.secrets/encryption_key
    secrets_status+=("encryption_key: ${C_GREEN}generated${C_RESET}")
  fi

  if [[ -f ./.secrets/pg_password ]]; then
    secrets_status+=("pg_password:    ${C_DIM}preserved${C_RESET}")
  else
    printf '%s' "$(openssl rand -base64 32 | tr -d '\n=+/' | head -c 40)" > ./.secrets/pg_password
    chmod 400 ./.secrets/pg_password
    secrets_status+=("pg_password:    ${C_GREEN}generated${C_RESET}")
  fi

  if [[ -f ./.secrets/setup_init_token ]]; then
    secrets_status+=("setup_token:    ${C_DIM}preserved${C_RESET}")
  else
    printf '%s' "$(openssl rand -hex 32)" > ./.secrets/setup_init_token
    chmod 400 ./.secrets/setup_init_token
    secrets_status+=("setup_token:    ${C_GREEN}generated${C_RESET}")
  fi

  for line in "${secrets_status[@]}"; do
    echo -e "    ${line}"
  done

  echo
  warn "Back up ${C_BOLD}./.secrets/encryption_key${C_RESET} to a password manager NOW."
  warn "Without it, all encrypted secrets in the database are unrecoverable."
}

# ════════════════════════════════════════════════════════════════════
# Step 6: Environment file
# ════════════════════════════════════════════════════════════════════
write_env_file() {
  step "Writing .env file"

  if [[ -f .env ]]; then
    if ask_yn ".env already exists — overwrite?" "n"; then
      cp .env ".env.backup-$(date +%s)"
      info "Existing .env backed up."
    else
      ok "Keeping existing .env."
      return
    fi
  fi

  cat > .env <<EOF
# Generated by install.sh on $(date -Iseconds)
# Do not commit this file.

# Public IP — used by the setup wizard for DNS validation
PUBLIC_IP=${PUBLIC_IP}

# Domain — used by Caddy for TLS and by the app for trusted origins
DOMAIN=${DOMAIN}

# Node environment
NODE_ENV=production
EOF

  chmod 600 .env
  ok ".env written."
}

# ════════════════════════════════════════════════════════════════════
# Step 7: Build images
# ════════════════════════════════════════════════════════════════════
build_stack() {
  step "Building Docker images"
  info "This pulls Postgres, Caddy, the socket-proxy, hermes-agent, and builds the hermes-os image."
  info "First run takes 3-8 minutes depending on bandwidth."

  info "Pre-pulling node:22-slim base image..."
  local max_pull_retries=5
  local pull_ok=0
  for ((p=1; p<=max_pull_retries; p++)); do
    if [[ $p -gt 1 ]]; then
      info "Retrying pull ($p/$max_pull_retries) in 15 seconds..."
      sleep 15
    fi
    if docker pull node:22-slim >> "$LOG_FILE" 2>&1; then
      pull_ok=1
      break
    else
      warn "Pull attempt $p failed."
    fi
  done
  if [[ $pull_ok -eq 0 ]]; then
    warn "Could not pre-pull node:22-slim — proceeding with build anyway."
  fi

  local max_retries=3
  local attempt=1

  while [[ $attempt -le $max_retries ]]; do
    if [[ $attempt -gt 1 ]]; then
      info "Retry $attempt/$max_retries in 15 seconds..."
      sleep 15
    fi

    info "Building (attempt $attempt/$max_retries)..."

    # Build each target sequentially to avoid buildx race conditions when
    # both hermes-os and migrator try to resolve their base images at once.
    if docker build --progress=plain -f Dockerfile --target migrator . >> "$LOG_FILE" 2>&1 \
       && docker build --progress=plain -f Dockerfile --target runtime . >> "$LOG_FILE" 2>&1; then
      ok "Build complete."
      return 0
    else
      if [[ $attempt -eq $max_retries ]]; then
        err "Build failed after $max_retries attempts."
        tail -30 "$LOG_FILE" | sed 's/^/    /'
        fatal "Build failed — see $LOG_FILE"
      fi
      warn "Build attempt $attempt failed — retrying..."
    fi
    attempt=$((attempt + 1))
  done
}

# ════════════════════════════════════════════════════════════════════
# Step 8: Start stack
# ════════════════════════════════════════════════════════════════════
start_stack() {
  step "Starting services"

  docker compose up -d >> "$LOG_FILE" 2>&1
  ok "Containers started."

  echo
  info "Waiting for services to become healthy..."

  local max_wait=120
  local waited=0
  local all_healthy=0

  while [[ $waited -lt $max_wait ]]; do
    local pg_ok=0 hermes_ok=0 caddy_ok=0

    if docker compose ps postgres 2>/dev/null | grep -q "healthy"; then
      pg_ok=1
    fi
    if docker compose ps hermes-os 2>/dev/null | grep -qE "running|Up"; then
      hermes_ok=1
    fi
    if docker compose ps caddy 2>/dev/null | grep -qE "running|Up"; then
      caddy_ok=1
    fi

    if [[ $pg_ok -eq 1 && $hermes_ok -eq 1 && $caddy_ok -eq 1 ]]; then
      all_healthy=1
      break
    fi

    sleep 3
    waited=$((waited + 3))
    printf "    ${C_DIM}elapsed: %ss${C_RESET}\r" "$waited"
  done
  echo

  if [[ $all_healthy -eq 0 ]]; then
    warn "Services did not become healthy within ${max_wait}s."
    echo
    docker compose ps | sed 's/^/    /'
    echo
    warn "Check logs: ${C_BOLD}docker compose logs${C_RESET}"
    return 1
  fi

  ok "Postgres, hermes-os and Caddy are running."

  # Migrator runs once and exits — check exit code
  local migrator_status
  migrator_status=$(docker compose ps migrator --format json 2>/dev/null | jq -r '.[0].ExitCode // .ExitCode // empty' || true)
  if [[ "$migrator_status" == "0" ]] || docker compose logs migrator 2>/dev/null | grep -q "Migrations applied"; then
    ok "Database migrations applied."
  else
    warn "Migrator exit status unclear — check: ${C_BOLD}docker compose logs migrator${C_RESET}"
  fi
}

# ════════════════════════════════════════════════════════════════════
# Step 9: Firewall
# ════════════════════════════════════════════════════════════════════
configure_firewall() {
  step "Configuring firewall (ufw)"

  if [[ $SKIP_FIREWALL -eq 1 ]]; then
    info "Skipping firewall config (--skip-firewall)"
    return
  fi

  if ! command -v ufw &>/dev/null; then
    warn "ufw not installed — skipping. Consider configuring your firewall manually."
    return
  fi

  info "Allowing SSH (22), HTTP (80), HTTPS (443)..."
  $SUDO ufw allow OpenSSH >> "$LOG_FILE" 2>&1 || $SUDO ufw allow 22/tcp >> "$LOG_FILE" 2>&1
  $SUDO ufw allow 80/tcp >> "$LOG_FILE" 2>&1
  $SUDO ufw allow 443/tcp >> "$LOG_FILE" 2>&1

  if ! $SUDO ufw status | grep -q "Status: active"; then
    if ask_yn "Enable ufw now? (will block any port not whitelisted)" "y"; then
      $SUDO ufw --force enable >> "$LOG_FILE" 2>&1
      ok "Firewall active."
    else
      warn "ufw rules added but firewall not enabled. Run ${C_BOLD}sudo ufw enable${C_RESET} when ready."
    fi
  else
    ok "Firewall rules added."
  fi
}

# ════════════════════════════════════════════════════════════════════
# Step 10: Smoke tests
# ════════════════════════════════════════════════════════════════════
smoke_test() {
  step "Running smoke tests"

  local url="http://localhost"
  [[ "$DOMAIN" != "localhost" ]] && url="https://${DOMAIN}"

  info "Testing ${url}/api/setup/status ..."
  local status_code
  status_code=$(curl -k -s -o /dev/null -w "%{http_code}" --max-time 10 "${url}/api/setup/status" || echo "000")

  case "$status_code" in
    200)
      ok "Setup API responding correctly."
      ;;
    502|503|504)
      warn "App not yet responding (HTTP ${status_code}). It may need another moment."
      warn "Try again in 30s: ${C_BOLD}curl -k ${url}/api/setup/status${C_RESET}"
      ;;
    000)
      warn "Could not reach the app at all. Check: ${C_BOLD}docker compose logs caddy hermes-os${C_RESET}"
      ;;
    *)
      warn "Unexpected response HTTP ${status_code}. Check: ${C_BOLD}docker compose logs${C_RESET}"
      ;;
  esac

  # Postgres should NOT be externally reachable
  info "Verifying Postgres is not externally reachable..."
  if timeout 3 bash -c "echo > /dev/tcp/${PUBLIC_IP}/5432" 2>/dev/null; then
    err "Postgres port 5432 is reachable from outside — this is a security risk!"
    err "Check that docker-compose.yml has no 'ports:' block on the postgres service."
  else
    ok "Postgres correctly isolated (not reachable on :5432)."
  fi
}

# ════════════════════════════════════════════════════════════════════
# Final summary
# ════════════════════════════════════════════════════════════════════
print_summary() {
  local url="http://localhost:3000"
  [[ "$DOMAIN" != "localhost" ]] && url="https://${DOMAIN}"

  echo
  echo -e "${C_GREEN}${C_BOLD}╔═════════════════════════════════════════════════════════════╗"
  echo -e "║                                                             ║"
  echo -e "║   ✓  hermes-os installed                                    ║"
  echo -e "║                                                             ║"
  echo -e "╚═════════════════════════════════════════════════════════════╝${C_RESET}"
  echo
  echo -e "${C_BOLD}NEXT STEPS${C_RESET}"
  echo
  echo -e "  ${SYM_ARROW} Open the setup wizard in your browser:"
  echo -e "    ${C_CYAN}${C_BOLD}${url}/setup${C_RESET}"
  echo
  echo -e "  ${SYM_ARROW} The wizard walks you through:"
  echo -e "    ${C_DIM}1.${C_RESET} Confirm domain  ${C_DIM}(already: ${DOMAIN})${C_RESET}"
  echo -e "    ${C_DIM}2.${C_RESET} Create admin account"
  echo -e "    ${C_DIM}3.${C_RESET} Enable 2FA  ${C_BOLD}${C_RED}(mandatory)${C_RESET}"
  echo -e "    ${C_DIM}4.${C_RESET} Configure LLM provider"
  echo -e "    ${C_DIM}5.${C_RESET} Connect Forgejo vault"
  echo -e "    ${C_DIM}6.${C_RESET} Provision your first hermes-agent container"
  echo
  echo -e "${C_BOLD}USEFUL COMMANDS${C_RESET}"
  echo
  echo -e "  ${C_DIM}# Show all services${C_RESET}"
  echo -e "  docker compose ps"
  echo
  echo -e "  ${C_DIM}# Tail logs${C_RESET}"
  echo -e "  docker compose logs -f hermes-os"
  echo
  echo -e "  ${C_DIM}# Restart everything${C_RESET}"
  echo -e "  docker compose restart"
  echo
  echo -e "  ${C_DIM}# Update to latest version${C_RESET}"
  echo -e "  git pull && docker compose up -d --build"
  echo
  echo -e "${C_BOLD}BACKUP${C_RESET}"
  echo
  echo -e "  ${SYM_WARN} ${C_YELLOW}Back up these files NOW:${C_RESET}"
  echo -e "    ${C_BOLD}./.secrets/encryption_key${C_RESET}    ${C_DIM}(losing this = data loss)${C_RESET}"
  echo -e "    ${C_BOLD}./.secrets/pg_password${C_RESET}"
  echo -e "    ${C_BOLD}./.env${C_RESET}"
  echo
  echo -e "${C_DIM}Install log: ${LOG_FILE}${C_RESET}"
  echo
}

# ════════════════════════════════════════════════════════════════════
# Main
# ════════════════════════════════════════════════════════════════════
main() {
  parse_args "$@"

  banner

  # Pre-flight (counted as part of the visual flow but not as a "step")
  check_root
  detect_os
  check_repo_location
  check_min_specs

  # Steps
  install_prerequisites
  install_docker
  detect_public_ip
  configure_domain
  generate_secrets
  write_env_file
  build_stack
  start_stack
  configure_firewall
  smoke_test

  print_summary
}

main "$@"
