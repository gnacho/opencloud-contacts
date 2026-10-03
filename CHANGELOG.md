# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Security
- Deploys no longer log in as root. The dev-deploy workflow and `deploy.sh`
  now use a `deploy-contacts` user whose keys are bound to a forced command
  (`deploy/server/contacts-deploy`): uploads are confined to the app
  directory by `rrsync -wo`, and `restart` runs one fixed script as
  `dockeruser` through a single sudoers rule. A leaked deploy key can no
  longer open a shell on the server. Setup steps in `deploy/server/SETUP.md`

## [0.4.4] – 2026-10-03

### Fixed
- Sidebar navigation no longer logs an `Error` to the console on every route
  change: `activeFor` referenced un-namespaced route names that the runtime
  could not resolve. "All contacts" is now also highlighted on contact
  detail pages

### Changed
- Build tooling aligned with OpenCloud Web 8 / web-extensions: vite 8,
  vitest 5, TypeScript 6, vue-tsc 3, vue3-gettext 4.0.1
- `pnpm audit` is clean (all previous findings were build/test-time only)

## [0.4.3] – 2026-10-03

### Security
- CSV export: values starting with `=`, `+`, `-`, `@`, tab or CR are prefixed
  with `'` so spreadsheet apps don't evaluate them as formulas (CSV injection);
  plain numbers like phone numbers stay unchanged, and the importer strips the
  prefix again on re-import
- vCard builder: UID is escaped, TYPE parameters are restricted to safe
  characters and BDAY is validated, preventing property injection through
  crafted vCards
- CSV import: birth year must be a 4-digit number
- `mailto:` and `tel:` links are percent-encoded, so a crafted address can no
  longer prefill cc/bcc/subject/body
- CI: tag name, ref and SSH key are passed via `env:` instead of being
  interpolated into shell scripts; deploy workflow pins the server's SSH host
  key instead of trusting `ssh-keyscan`

### Fixed
- Birthdays without a year (`--MMDD`) are no longer corrupted when saving

### Changed
- CI runs on Node 24 with pnpm pinned to 10.28.1

## [0.4.2] – 2026-10-03

### Security
- CardDAV app token is no longer persisted in `localStorage`; it is kept in
  memory only, so it no longer survives logout or browser restarts
- App token lifetime reduced from 24h to 1h (renewed automatically)
- App token is revoked server-side when the page is left (reload, tab close,
  logout redirect) and on logout or user switch
- Tokens stored by previous versions are removed from `localStorage` and the
  current user's token is revoked on first use

### Changed
- Updated OpenCloud SDK packages to v8.0.0
- Business card appearance improved in dark mode

## [0.4.1] – 2026-04-29

### Added
- Duplicate detection: find contacts with identical names and review them grouped
- Merge selected contacts within a group: multi-value fields (emails, phones,
  categories) are unioned and deduplicated; scalar fields take the first
  non-empty value from the selected contacts; the base contact's UID and href
  are preserved
- Preview step before confirming a single-group merge
- "Merge all" button to merge all duplicate groups at once, with a confirmation
  dialog before executing
- Hover tooltips on icon-only toolbar buttons (duplicates, delete all, reload)

## [0.4.0] – 2026-04-18

### Changed
- **Breaking:** App-ID renamed from `contacts-test` to `opencloud-contacts`.
  Existing installations must rename their apps directory:
  `config/opencloud/apps/contacts-test/` → `config/opencloud/apps/opencloud-contacts/`

## [0.3.2] – 2026-04-17

### Fixed
- PHOTO parsing: `unfold()` no longer strips base64 padding `=` at line-end as
  a QP soft-break, which was merging `END:VCARD` into the base64 value and
  corrupting photos after a page reload
- PHOTO parsing: first valid PHOTO property wins; subsequent PHOTO lines are
  ignored so a stale or broken second PHOTO cannot overwrite a good one
- PHOTO serialization: write `PHOTO;ENCODING=b;TYPE=…` (vCard 3.0 inline
  base64) instead of a vCard 4.0 data URI — Radicale/vobject was splitting on
  the comma in `data:image/jpeg;base64,…` and dropping the payload

## [0.3.1] – 2026-04-14

### Added
- Forgejo CI workflow (build + test on every push/PR)
- Forgejo Release workflow (build, zip, publish on tag)

## [0.3.0] – 2026-04-13

### Added
- Business card detail view: colored header with avatar, name, title and organization
- Structured contact rows with icon, label and value
- Compact horizontal action toolbar (Email, Call, vCard, Edit, Delete)
- `src/manifest.json` with `id`, `name`, `description`, `version` for proper OpenCloud app registration
- Dark mode card elevation (color-mix, border, inset highlight, shadow)
- Outline-style group chips — visible in both light and dark mode

### Fixed
- Redundant name card removed from detail view
- `deploy.sh`: use `docker compose restart` instead of `up -d` so OpenCloud always re-reads manifest
- `deploy.sh`: restart Traefik after OpenCloud to prevent routing outages

## [0.2.0] – 2026-04-05

### Added
- Version footer in ContactsView and ContactDetailView
- Group support: display groups in list and detail view, set default group on import
- Bulk "set group Alle" button for contacts without group
- Groups shown as separate column in contacts table
- Group selection via datalist dropdown across all group inputs
- Groups included in contact search
- Thunderbird-compatible CSV export
- vCard download button in contact detail
- Profile photo support (AvatarUpload component)
- Size hint in AvatarUpload

### Fixed
- Token handling: in-flight dedup, 401 retry, 24h TTL, per-user localStorage key
- App token persisted per user with 2-year expiry; purge expired tokens on login
- User-switch isolation: clear store on logout, reload on re-login
- Various CSV importer fixes: department, custom fields, semicolon separator, data-loss prevention
- vCard parser: unescape, bare TYPE flags, namespace-safe PROPFIND
- RFC 6350 compliant line folding; BOM handling; strict CSV; single-pass escape
- PHOTO handling: correct MIME type, no base64 folding, vCard 3.0 ENCODING=b
- CardDAV import performance: sliding window concurrency, sequential writes
- Security hardening: CardDAV URL validation, photo URL handling, credential leak fixes

## [0.1.1] – 2026-04-04

### Fixed
- Various stability and routing fixes
- Named route navigation, keyboard handler and GIF support in AvatarUpload
- Contact detail: email/call link styling aligned with oc-button

## [0.1.0] – 2026-04-04

### Added
- Initial release: OpenCloud Contacts web extension
- CardDAV contact list, detail view, create/edit/delete
- CSV import with review step
- Contact search and navigation
