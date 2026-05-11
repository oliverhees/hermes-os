#!/usr/bin/env bash
set -euo pipefail
mkdir -p .secrets && chmod 700 .secrets

# 1. Generate secrets if missing
[[ -f .secrets/encryption_key ]] || ./scripts/init-encryption-key.sh
[[ -f .secrets/pg_password ]] || (printf '%s' "$(openssl rand -base64 32 | tr -d '\n')" > .secrets/pg_password && chmod 400 .secrets/pg_password)
[[ -f .secrets/setup_init_token ]] || (openssl rand -hex 32 > .secrets/setup_init_token && chmod 400 .secrets/setup_init_token)

# 2. Detect public IP
if [[ -z "${PUBLIC_IP:-}" ]]; then
  PUBLIC_IP=$(curl -s4 https://ifconfig.me)
  echo "Detected public IP: $PUBLIC_IP"
fi

# 3. Write .env if missing
if [[ ! -f .env ]]; then
  cp .env.example .env
  sed -i.bak "s|^PUBLIC_IP=.*|PUBLIC_IP=$PUBLIC_IP|" .env
  rm -f .env.bak
fi

echo "Bootstrap complete. Run: docker compose up -d"
