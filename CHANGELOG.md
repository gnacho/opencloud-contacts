# Changelog

All notable changes to this project will be documented in this file.

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
