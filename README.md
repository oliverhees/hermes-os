<div align="center">

<img src="./public/claude-avatar.webp" alt="HERMES OS" width="80" style="border-radius: 16px" />
<!-- avatar filename retained for cache stability — do not rename without coordinated cache-bust -->

# HERMES OS

**Multi-User AI Operating System on top of Hermes Agent**

[![Version](https://img.shields.io/badge/version-2.3.0-2557b7.svg)](CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen.svg)](https://nodejs.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-6366F1.svg)](CONTRIBUTING.md)

> Self-contained production stack: multi-user auth, TOTP 2FA, Docker socket isolation, per-user agent containers, and a browser-based setup wizard.

![HERMES OS](./docs/screenshots/splash.png)

</div>

---

## Quick Start

### Fresh server install

On a fresh Ubuntu 22+/Debian 12+/Pop!_OS 22+ server:

```bash
git clone https://github.com/oliverhees/hermes-os.git
cd hermes-os
sudo ./install.sh
```

The installer handles everything:

- Installs Docker + Compose (if not present)
- Detects your public IP and validates DNS
- Generates encryption keys, Postgres password, and setup token
- Builds and starts the full stack
- Configures the ufw firewall (22/80/443)
- Runs smoke tests

After the installer finishes, open `https://<your-domain>/setup` to complete the setup wizard.

### Installer options

| Flag | Effect |
|---|---|
| `--domain=<fqdn>` | Pre-set the domain (skips interactive prompt) |
| `--non-interactive` | CI/automation mode (uses defaults) |
| `--skip-firewall` | Don't configure ufw |
| `--skip-docker` | Assume Docker is already installed |

### Local development

```bash
sudo ./install.sh --domain=localhost --skip-firewall
```

The app is then available at `http://localhost/setup`.

### System requirements

- 2 GB RAM minimum (4 GB recommended for production)
- 20 GB free disk space
- Ports 80 and 443 reachable from the internet (for Let's Encrypt)
- A domain with an A record pointing to the server

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                         HERMES OS Stack                               │
│                                                                      │
│   ┌─────────────┐      :443 (TLS)      ┌─────────────────────┐    │
│   │   Clients   │◀───────────────────▶│       Caddy         │    │
│   └─────────────┘                      │   (TLS termination) │    │
│                                         └──────────┬──────────┘    │
│                                                    │                │
│                                         ┌──────────▼──────────┐    │
│                                         │     hermes-os      │    │
│                                         │  (Node.js + UI)    │    │
│                                         └──────────┬──────────┘    │
│                                                    │                │
│   ┌─────────────────────────────────────────────────┼────────────┐  │
│   │                    internal network              │            │  │
│   │                                                 │            │  │
│   │  ┌──────────┐  ┌──────────┐  ┌──────────────▼──────────┐ │  │
│   │  │ Postgres │  │  migrator │  │     socket-proxy        │ │  │
│   │  │  :5432   │  │  (once)  │  │  (Docker socket :2375)  │ │  │
│   │  └──────────┘  └──────────┘  └──────────────┬──────────┘ │  │
│   │                                               │            │  │
│   │                              ┌────────────────▼────────────┐ │  │
│   │                              │      hermes-agent          │ │  │
│   │                              │   (NousResearch upstream)  │ │  │
│   │                              │   per-user container       │ │  │
│   │                              └─────────────────────────────┘ │  │
│   └──────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

### Docker Compose services

| Service | Image | Purpose |
|---|---|---|
| `caddy` | `caddy:2.8-alpine` | TLS termination, HTTPS, reverse proxy to hermes-os |
| `hermes-os` | build from source | Main application (UI + API) |
| `postgres` | `postgres:16-alpine` | User accounts, sessions, audit logs, system config |
| `migrator` | build from source | Runs DB migrations on startup, then exits |
| `socket-proxy` | `tecnativa/docker-socket-proxy:0.3.0` | Isolated Docker socket for per-user container provisioning |
| `hermes-agent` | `nousresearch/hermes-agent:latest` | AI agent backend |

### Network topology

- **edge network**: Caddy + hermes-os + hermes-agent (Caddy proxies to hermes-os)
- **internal network**: Postgres + migrator + hermes-os + socket-proxy + hermes-agent (no external exposure)

### Security boundaries

- **Postgres**: Internal-only (`ports:` block removed) — accessed only from hermes-os container
- **Docker socket proxy**: Whitelisted capabilities only — `CONTAINERS`, `IMAGES`, `NETWORKS`, `VOLUMES`, `EXEC`; read-only mount, `cap_drop: ALL`, `no-new-privileges: true`
- **hermes-agent**: Runs per-user inside isolated containers, not as a shared system service

---

## Setup Wizard

After `install.sh` completes, open `https://<your-domain>/setup`.

The wizard walks you through six steps:

| Step | Description |
|---|---|
| 1 | Confirm domain (pre-filled from install) |
| 2 | Create admin account (email + password, min 12 chars) |
| 3 | Enable TOTP 2FA (**mandatory for admin**) |
| 4 | Configure LLM provider (Anthropic, OpenAI, OpenRouter, Google, Ollama, etc.) |
| 5 | Connect Forgejo vault (optional, for skills/secrets) |
| 6 | Provision your first hermes-agent container |

### What the wizard configures

- **System config** stored in Postgres: domain, LLM provider, vault repo
- **Admin 2FA** enforced — no bypass
- **Per-user container** provisioning via Docker socket proxy
- **2FA secrets** encrypted with AES-256-GCM before storage
- **Audit log** entries for every wizard step

### Restarting the wizard

If setup was interrupted or you need to re-run:

```bash
docker compose restart hermes-os
# Then visit /setup again
```

---

## Management Commands

```bash
# Show all services and status
docker compose ps

# View logs
docker compose logs -f hermes-os
docker compose logs -f hermes-agent
docker compose logs -f caddy
docker compose logs -f postgres

# Restart everything
docker compose restart

# Update to latest version
git pull && docker compose up -d --build

# Stop the stack
docker compose down

# Run database migrations manually
docker compose run --rm migrator

# Access Postgres directly (from within the stack)
docker compose exec postgres psql -U hermes_os hermes_os

# View resource usage
docker compose top

# Backup the database volume
docker compose stop
docker run --rm -v hermes-os_pg_data:/data -v $(pwd)/backup:/backup alpine tar czf /backup/pg_data.tar.gz -C /data .
```

### Updating

```bash
git pull
docker compose up -d --build
docker compose logs -f hermes-os
```

---

## Security

### Built-in protections

| Protection | Implementation |
|---|---|
| Password hashing | Argon2 via Better Auth |
| 2FA secrets | AES-256-GCM encrypted before DB storage |
| Session cookies | `HttpOnly` + `SameSite=Strict` + `Secure` (production) |
| Rate limiting | Per-route limits (sign-in: 5/min, sign-up: 3/5min, 2FA: 5/min) |
| Postgres isolation | No `ports:` block — container-only access |
| Docker socket | Read-only proxy with capability whitelist |
| CSP headers | Caddy sets `Strict-Transport-Security`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` |
| Trusted origins | Configured from system domain at startup |

### Environment variables for deployment

| Variable | Purpose |
|---|---|
| `COOKIE_SECURE=1` | Force `Secure` cookie flag (behind TLS proxy) |
| `COOKIE_SECURE=0` | Disable `Secure` flag for plain-HTTP LAN deployments |
| `TRUST_PROXY=1` | Trust `x-forwarded-for` headers (only behind a sanitizing proxy) |

### Secret management

Secrets are stored in `.secrets/` (git-ignored) and read at container startup:

| Secret | Purpose |
|---|---|
| `.secrets/pg_password` | Postgres credentials |
| `.secrets/encryption_key` | AES-256-GCM encryption for 2FA secrets |
| `.secrets/setup_init_token` | Initial setup wizard access token |

> **Back up `.secrets/encryption_key` immediately after installation.** Without it, all 2FA recovery codes and encrypted config values are unrecoverable.

---

## Screenshots

|                 Chat                 |                  Conductor                   |
| :----------------------------------: | :------------------------------------------: |
| ![Chat](./docs/screenshots/chat.png) | ![Conductor](./docs/screenshots/conductor.png) |

|                   Dashboard                  |                  Memory                  |
| :------------------------------------------: | :--------------------------------------: |
| ![Dashboard](./docs/screenshots/dashboard.png) | ![Memory](./docs/screenshots/memory.png) |

|                   Terminal                   |                   Settings                   |
| :------------------------------------------: | :------------------------------------------: |
| ![Terminal](./docs/screenshots/terminal.png) | ![Settings](./docs/screenshots/settings.png) |

|                  Tasks                  |                 Jobs                 |
| :--------------------------------------: | :----------------------------------: |
| ![Tasks](./docs/screenshots/tasks.png) | ![Jobs](./docs/screenshots/jobs.png) |

---

## Roadmap

### Phase 1 — COMPLETE ✅

| Feature | Status |
|---|---|
| Multi-user auth (Postgres + Better Auth) | Complete |
| TOTP 2FA (mandatory for admin) | Complete |
| Setup wizard API | Complete |
| Docker Compose stack | Complete |
| Audit logging | Complete |

### Phase 2 — IN PROGRESS 🔨

| Feature | Status |
|---|---|
| Wizard UI (replaces `/setup` API-only flow) | Pending |
| Removal of legacy `HERMES_PASSWORD` middleware | Pending |

### Phase 3 — PLANNED 🔜

| Feature | Status |
|---|---|
| Per-user agent container provisioning (Docker socket proxy) | Planned |
| User container lifecycle management (create, suspend, archive) | Planned |

---

## Contributing

PRs are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

- Bug fixes → open a PR directly
- New features → open an issue first to discuss
- Security issues → see [SECURITY.md](SECURITY.md) for responsible disclosure

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

<div align="center">
  <sub>Built with ⚡ by <a href="https://github.com/oliverhees">@oliverhees</a></sub>
</div>
