#!/usr/bin/env bash
set -euo pipefail
SECRETS_DIR="${SECRETS_DIR:-./.secrets}"
mkdir -p "$SECRETS_DIR"
chmod 700 "$SECRETS_DIR"

KEY_FILE="$SECRETS_DIR/encryption_key"
if [[ -f "$KEY_FILE" ]]; then
  echo "Encryption key already exists at $KEY_FILE — refusing to overwrite."
  echo "If you really want a fresh key (DESTROYS all encrypted data), delete the file manually."
  exit 1
fi

openssl rand -base64 32 > "$KEY_FILE"
chmod 400 "$KEY_FILE"
echo "Generated $KEY_FILE — back this up in your password manager NOW."
echo "Without this key, all encrypted secrets in postgres are unrecoverable."
