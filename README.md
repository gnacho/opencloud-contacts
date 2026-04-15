# OpenCloud Contacts

A web extension for [OpenCloud](https://opencloud.eu) that provides a full-featured contacts management app using CardDAV (Radicale).

[![AI Assisted](https://img.shields.io/badge/AI%20assisted-Claude%20Code-orange?logo=anthropic)](https://claude.ai) [![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

> [!IMPORTANT]
> This project is an independent, community-built tool and is not affiliated with, endorsed by, or associated with the [OpenCloud project](https://opencloud.eu) in any way.

## Features

- Browse and search contacts loaded from CardDAV
- Sort by name, organisation, email or phone
- Contact detail view with prev/next navigation
- Create, edit and delete contacts
- Import contacts from Thunderbird CSV export
- Fully integrated into the OpenCloud UI (left sidebar, app menu)

## Tech Stack

- Vue 3 + TypeScript
- Vite 7 + `@opencloud-eu/extension-sdk` (Module Federation)
- CardDAV via Radicale (OpenCloud built-in)
- pnpm

## Prerequisites

### docker-compose.yml

OpenCloud Web automatically loads extensions from a local directory — no `OC_APPS_DIR` variable needed. The default bind mount to `config/opencloud/apps` is sufficient:

```yaml
services:
  opencloud:
    volumes:
      - ./config/opencloud/apps:/etc/ocis/apps:ro
```

### CSP (csp.yaml)

No `unsafe-eval` needed. Vite 7 production builds do not use `eval()`.

```yaml
script-src:
  - 'self'
  - 'unsafe-inline'
```

## Installation

```bash
# Clone the repository
git clone https://forgejo.linux-nerds.org/frank/opencloud-contacts.git
cd opencloud-contacts

# Install dependencies
pnpm install

# Build
pnpm build
```

Copy the contents of `dist/` to your OpenCloud apps directory:

```
config/opencloud/apps/contacts-test/
```

Then restart the OpenCloud container.

## Development & Deployment

Edit `deploy.sh` with your server details, then run:

```bash
./deploy.sh
```

This will build the app, upload `dist/` via rsync and restart the OpenCloud container.

## Authentication

OpenCloud uses Bearer tokens (OAuth2/OIDC via Keycloak). Radicale only accepts HTTP Basic Auth. The app handles this transparently:

1. Obtains a Bearer token from the OpenCloud auth store
2. Exchanges it for an App Token via `POST /auth-app/tokens`
3. Uses `Basic base64(username:app-token)` for all CardDAV requests

The app token is cached in `sessionStorage` and refreshed automatically on auth errors.

## CSV Import

Supports Thunderbird address book exports (CSV, German column headers). To import:

1. In Thunderbird: **Tools → Export → CSV**
2. In the Contacts app: click **Import**
3. Optionally check **Delete all existing contacts before import**
4. Select the CSV file and click **Import**

## Project Structure

```
src/
├── index.ts                    # App entry point (defineWebApplication)
├── types/contact.ts            # TypeScript interfaces
├── views/
│   ├── ContactsView.vue        # List view
│   └── ContactDetailView.vue   # Detail view
├── components/
│   ├── ImportDialog.vue        # CSV import dialog
│   ├── NewContactDialog.vue    # Create contact dialog
│   └── EditContactDialog.vue   # Edit contact dialog
├── composables/
│   ├── useCardDAV.ts           # CardDAV communication
│   └── useContactStore.ts      # Shared reactive state
└── utils/
    ├── vcard-parser.ts         # vCard 3/4 → Contact
    ├── vcard-builder.ts        # Contact → vCard 4.0
    └── csv-importer.ts         # Thunderbird CSV → vCard
```

## Documentation

Detailed developer documentation (also available in DokuWiki format):

- [`docs/opencloud-extension-development.md`](docs/opencloud-extension-development.md)
- [`docs/opencloud-extension-development.dokuwiki`](docs/opencloud-extension-development.dokuwiki)

Covers: authentication flow, CardDAV API, routing quirks, known pitfalls, server configuration and a checklist for building new extensions.

## License

GPL-3.0-or-later
