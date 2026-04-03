# OpenCloud Web Extension – Entwicklungsdokumentation

Erstellt am: 2026-04-02
Projekt: `opencloud-contacts` (App-ID: `contacts-test`)
Zweck: Referenz für Entwicklung und Debugging von OpenCloud Web Extensions

---

## Inhaltsverzeichnis

1. [Projektstruktur](#1-projektstruktur)
2. [Tech-Stack](#2-tech-stack)
3. [Build & Deployment](#3-build--deployment)
4. [App-Registrierung in OpenCloud](#4-app-registrierung-in-opencloud)
5. [Authentifizierung – CardDAV Basic Auth](#5-authentifizierung--carddav-basic-auth)
6. [CardDAV-Zugriff](#6-carddav-zugriff)
7. [Routing](#7-routing)
8. [State Management](#8-state-management)
9. [Komponenten-Übersicht](#9-komponenten-übersicht)
10. [Bekannte Fallstricke](#10-bekannte-fallstricke)
11. [Server-Konfiguration](#11-server-konfiguration)
12. [CSP-Konfiguration](#12-csp-konfiguration)

---

## 1. Projektstruktur

```
opencloud-contacts/
├── src/
│   ├── index.ts                    # App-Einstiegspunkt (defineWebApplication)
│   ├── types/
│   │   └── contact.ts              # TypeScript-Interfaces
│   ├── views/
│   │   ├── ContactsView.vue        # Listenansicht
│   │   └── ContactDetailView.vue   # Detailansicht
│   ├── components/
│   │   ├── ImportDialog.vue        # CSV-Import (Thunderbird-Format)
│   │   ├── NewContactDialog.vue    # Neuen Kontakt anlegen
│   │   └── EditContactDialog.vue   # Kontakt bearbeiten
│   ├── composables/
│   │   ├── useCardDAV.ts           # CardDAV-Kommunikation
│   │   └── useContactStore.ts      # Shared State (reaktiv)
│   └── utils/
│       ├── vcard-parser.ts         # vCard 3/4 → Contact
│       ├── vcard-builder.ts        # Contact → vCard 4.0
│       └── csv-importer.ts         # Thunderbird CSV → vCard
├── vite.config.ts
├── package.json
├── deploy.sh
└── docs/
    └── opencloud-extension-development.md  # Diese Datei
```

---

## 2. Tech-Stack

| Paket | Version | Zweck |
|-------|---------|-------|
| `@opencloud-eu/extension-sdk` | ^6.0.0 | Build-System, Module Federation |
| `@opencloud-eu/web-pkg` | ^6.0.0 | Vue-Komponenten, Composables, Router |
| `@opencloud-eu/web-client` | ^6.0.0 | Utilities (urlJoin etc.) |
| `vue` | ^3.5 | Framework |
| `vite` | ^7.2.0 | Build-Tool (muss explizit als devDep stehen!) |
| `vue3-gettext` | 2.3.4 | i18n (Version exakt pinnen – ^3.x existiert nicht) |
| `pnpm` | >=10.28.1 | Package Manager |

### Wichtig: `vite` explizit als devDependency

```json
"devDependencies": {
  "vite": "^7.2.0"
}
```

Ohne das schlägt `pnpm build` mit "vite command not found" fehl, weil `extension-sdk` es nicht re-exportiert.

### Wichtig: `@vitejs/plugin-vue` NICHT als devDep

Wird von `extension-sdk` intern bereitgestellt. Wenn manuell hinzugefügt, entsteht ein Peer-Dependency-Konflikt.

---

## 3. Build & Deployment

### Lokal bauen

```bash
pnpm install
pnpm build
# Ausgabe: dist/
```

### Deploy-Script

```bash
./deploy.sh
```

Das Script:
1. Baut die App (`pnpm install && pnpm build`)
2. Erstellt das Remote-Verzeichnis via SSH
3. Überträgt `dist/` via rsync (mit `--delete`)
4. Startet den OpenCloud-Container neu

**Konfiguration in `deploy.sh`:**
```bash
REMOTE_USER="root"
REMOTE_HOST="cloud.linux-nerds.org"
REMOTE_DIR="/home/dockeruser/opencloud-compose-keycloak"
APP_NAME="contacts-test"
```

**App-Pfad auf dem Server:**
```
$REMOTE_DIR/config/opencloud/apps/$APP_NAME/
```

### Ausgabe-Format

Vite 7 + extension-sdk erzeugt `.mjs`-Dateien im Ordner `dist/js/`. Der Einstiegspunkt ist `remoteEntry-<hash>.mjs`. Das `manifest.json` wird automatisch generiert und zeigt auf die aktuelle Hash-Version.

**Wichtig:** Keine eigene `public/manifest.json` anlegen – extension-sdk überschreibt sie nicht, sondern überspringt die Generierung → falsche Referenz.

---

## 4. App-Registrierung in OpenCloud

### `src/index.ts` – Grundstruktur

```typescript
import { defineWebApplication, AppNavigationItem } from '@opencloud-eu/web-pkg'

export default defineWebApplication({
  setup(args) {
    const appInfo = {
      id: 'contacts-test',   // App-ID = URL-Präfix = Verzeichnisname auf Server
      name: 'Contacts',
      icon: 'contacts-book',
      color: '#0063BE'
    }

    const routes = [
      {
        path: '/list',
        name: 'contacts-list',
        component: () => import('./views/ContactsView.vue'),
        meta: { authContext: 'user', title: 'Contacts' }
      },
      {
        path: '/contact/:uid',
        name: 'contact-detail',
        component: () => import('./views/ContactDetailView.vue'),
        meta: { authContext: 'user', title: 'Contact' }
      }
    ]

    // Linke Sidebar (wie bei Files: "Personal", "Favorites" etc.)
    const navItems: AppNavigationItem[] = [
      {
        name: () => 'All contacts',
        icon: 'contacts-book',
        route: { path: `/contacts-test/list` },
        activeFor: [
          { name: 'contacts-list' },
          { name: 'contact-detail' }   // Sidebar bleibt auch in Detailansicht aktiv
        ]
      }
    ]

    return { appInfo, routes, navItems, extensions: extensions(args) }
  }
})
```

### App-Menüeintrag (Waffle-Menü oben links)

Über `AppMenuItemExtension`:

```typescript
const menuItems: AppMenuItemExtension[] = [
  {
    id: `app.${appInfo.id}.menuItem`,
    type: 'appMenuItem',
    label: () => appInfo.name,
    color: appInfo.color,
    icon: appInfo.icon,
    path: urlJoin(appInfo.id, 'list')
  }
]
```

### Server: App-Verzeichnis aktivieren

OpenCloud Web lädt Extensions automatisch aus dem gebundenen Apps-Verzeichnis — `OC_APPS_DIR` muss nicht gesetzt werden. Das Standard-Volume reicht:

In `docker-compose.yml`:

```yaml
volumes:
  - ./config/opencloud/apps:/etc/ocis/apps:ro
```

---

## 5. Authentifizierung – CardDAV Basic Auth

Dies war der schwierigste Teil. Hier die vollständige Lösung:

### Problem

OpenCloud nutzt **Bearer-Token** (OAuth2/OIDC via Keycloak) für die Web-UI. Radicale (der CardDAV-Server) akzeptiert aber **nur HTTP Basic Auth**. Der OpenCloud-Proxy leitet Basic-Auth-Anfragen an Radicale weiter – aber nur mit einem speziellen **App-Token**, nicht mit dem Bearer-Token.

### Lösung: App-Token-Flow

```
1. Web-UI hat Bearer-Token (aus Keycloak)
2. POST /auth-app/tokens  →  erzeugt App-Token (Passwort für Basic Auth)
3. Alle CardDAV-Anfragen: Authorization: Basic base64(username:app-token)
```

### Implementierung (`useCardDAV.ts`)

```typescript
const APP_TOKEN_KEY = 'oc-contacts-app-token'

async function createAppToken(bearerToken: string): Promise<string> {
  const resp = await fetch('/auth-app/tokens?expiry=72h&label=contacts-app', {
    method: 'POST',
    headers: { Authorization: `Bearer ${bearerToken}` }
  })
  const data = await resp.json() as { token: string }
  return data.token
}

async function getAppToken(): Promise<string> {
  const cached = sessionStorage.getItem(APP_TOKEN_KEY)
  if (cached) return cached

  const bearerToken = authStore.accessToken
  const token = await createAppToken(bearerToken)
  sessionStorage.setItem(APP_TOKEN_KEY, token)
  return token
}
```

**Wichtig:**
- `GET /auth-app/tokens` gibt UUIDs zurück, keine nutzbaren Token → immer `POST` verwenden
- Token im `sessionStorage` cachen (nicht localStorage – wird beim Browser-Schließen gelöscht)
- Bei 401/403 den Cache leeren und neu versuchen:

```typescript
if (response.status === 401 || response.status === 403) {
  sessionStorage.removeItem(APP_TOKEN_KEY)
}
```

### Username ermitteln

```typescript
function getUsername(): string {
  const u = userStore.user
  return u?.onPremisesSamAccountName || u?.displayName || ''
}

function getUserPath(): string {
  const uuid = userStore.user?.id  // UUID immer vorhanden!
  if (uuid) return `${getCardDAVBase()}/${uuid}/`
  return `${getCardDAVBase()}/${encodeURIComponent(getUsername())}/`
}
```

**Wichtig:** `onPremisesSamAccountName` kann beim App-Start leer sein. `user.id` (UUID) ist immer befüllt und funktioniert als CardDAV-Pfad.

---

## 6. CardDAV-Zugriff

### Address Books entdecken (PROPFIND)

```typescript
const response = await fetch(getUserPath(), {
  method: 'PROPFIND',
  headers: {
    Authorization: `Basic ${btoa(`${username}:${appToken}`)}`,
    'Content-Type': 'application/xml; charset=utf-8',
    Depth: '1'
  },
  body: `<?xml version="1.0" encoding="utf-8" ?>
    <D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav">
      <D:prop>
        <D:resourcetype/>
        <D:displayname/>
      </D:prop>
    </D:propfind>`
})
```

### Kontakte abrufen (REPORT)

```typescript
const response = await fetch(bookUrl, {
  method: 'REPORT',
  headers: { ...headers, Depth: '1' },
  body: `<?xml version="1.0" encoding="utf-8" ?>
    <C:addressbook-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav">
      <D:prop>
        <D:getetag/>
        <C:address-data/>
      </D:prop>
    </C:addressbook-query>`
})
```

### XML-Parsing (WICHTIG: kein DOMParser!)

Radicale gibt `<CR:address-data>` zurück (Namespace-Präfix `CR:`). `DOMParser` in bestimmten Browsern behandelt das inkonsistent. **Lösung: Regex-Parser.**

```typescript
export function parseCardDAVReport(xmlText: string) {
  const results = []
  const responseRegex = /<[^:>]*:?response[^>]*>([\s\S]*?)<\/[^:>]*:?response>/gi
  let match
  while ((match = responseRegex.exec(xmlText)) !== null) {
    const block = match[1]
    const hrefMatch = /<[^:>]*:?href[^>]*>([\s\S]*?)<\/[^:>]*:?href>/i.exec(block)
    const addrMatch = /<[^:>]*:?address-data[^>]*>([\s\S]*?)<\/[^:>]*:?address-data>/i.exec(block)
    if (addrMatch?.[1].includes('BEGIN:VCARD')) {
      results.push({ href: hrefMatch?.[1].trim() ?? '', vcardRaw: addrMatch[1].trim() })
    }
  }
  return results
}
```

### Kontakt speichern (PUT)

```typescript
await fetch(`${bookUrl}${uid}.vcf`, {
  method: 'PUT',
  headers: {
    Authorization: `Basic ${btoa(`${username}:${appToken}`)}`,
    'Content-Type': 'text/vcard; charset=utf-8',
    'If-None-Match': '*'   // Nur neu anlegen, nicht überschreiben
  },
  body: vcardData
})
```

Zum **Überschreiben** (Update): `If-None-Match: *` weglassen.

### Kontakt löschen (DELETE)

```typescript
await fetch(contactHref, {
  method: 'DELETE',
  headers: { Authorization: `Basic ${btoa(`${username}:${appToken}`)}` }
})
```

---

## 7. Routing

### Router-Import

**Nicht** `vue-router` direkt importieren – `useRouter()` gibt `undefined` zurück!

```typescript
// ✓ Richtig:
import { useRouter } from '@opencloud-eu/web-pkg'

// ✗ Falsch:
import { useRouter } from 'vue-router'
```

### Navigation mit vollem Pfad

```typescript
router.push(`/contacts-test/contact/${encodeURIComponent(uid)}`)
//           ↑ App-ID-Präfix immer mitsenden!
```

### UID aus URL lesen

`useRoute().params` kann in OpenCloud-Kontext `undefined` sein. Sicherer:

```typescript
const currentUid = ref(extractUid())

function extractUid(): string {
  const parts = window.location.pathname.split('/contact/')
  return parts.length > 1 ? decodeURIComponent(parts[1].split('/')[0]) : ''
}
```

Für reaktive Navigation (Prev/Next-Buttons): `currentUid` als `ref` führen und beim Klick direkt setzen:

```typescript
function goNext() {
  const target = navList.value[currentIndex.value + 1]
  currentUid.value = target.uid          // ← Reaktivität auslösen
  router.push(`/contacts-test/contact/${encodeURIComponent(target.uid)}`)
}
```

---

## 8. State Management

Kein Vuex/Pinia nötig – einfaches reaktives Modul-Level-State reicht:

```typescript
// useContactStore.ts
const contacts = ref<Contact[]>([])          // Alle geladenen Kontakte
const navigationList = ref<Contact[]>([])    // Aktuell sortierte/gefilterte Liste

export function useContactStore() {
  return { contacts, navigationList, findByUid, setContacts, setNavigationList }
}
```

`navigationList` wird beim Öffnen eines Kontakts aus der Liste gesetzt (`setNavigationList(filteredContacts.value)`) — damit folgen die Prev/Next-Pfeile der aktuellen Sortierung.

---

## 9. Komponenten-Übersicht

### `oc-search-bar`

```vue
<!-- ✓ Richtig: -->
<oc-search-bar
  v-model="searchQuery"
  :label="$gettext('Search contacts')"   <!-- Pflichtfeld! Fehlt → Crash bei Fokus -->
  :placeholder="$gettext('Search…')"
  :button-hidden="true"
  :type-ahead="true"
  :is-filter="true"
/>

<!-- ✗ Falsch (crasht): -->
<oc-search-bar :value="q" @input="q=$event" @clear="q=''" />
```

### `oc-modal`

```vue
<oc-modal
  :title="$gettext('Titel')"
  :button-cancel-text="$gettext('Cancel')"
  :button-confirm-text="$gettext('Save')"
  :button-confirm-disabled="saving"
  size="medium"
  @cancel="$emit('close')"
  @confirm="save"
>
  <template #content>
    <!-- Inhalt hier -->
  </template>
</oc-modal>
```

### Eingabefelder im Darkmode

OpenCloud-CSS-Variablen (`--oc-color-border`, `--oc-color-background-default`) haben im Darkmode zu wenig Kontrast. Lösung mit `prefers-color-scheme`:

```css
.oc-text-input, .oc-textarea, select {
  border: 1px solid #999;
  background: #f5f5f5;
  color: #1a1a1a;
}

@media (prefers-color-scheme: dark) {
  .oc-text-input, .oc-textarea, select {
    background: #2a2a2a;
    color: #e8e8e8;
    border-color: #666;
  }
}

.oc-text-input:focus, .oc-textarea:focus, select:focus {
  outline: none;
  border-color: #4d9de0;
  box-shadow: 0 0 0 2px rgba(77,157,224,0.35);
}
```

---

## 10. Bekannte Fallstricke

| Problem | Ursache | Lösung |
|---------|---------|--------|
| `vite: command not found` | vite nicht als devDep | `"vite": "^7.2.0"` in devDeps |
| `vue3-gettext` nicht gefunden | `^3.0.0` existiert nicht | Version `2.3.4` exakt pinnen |
| App erscheint nicht im Menü | Volume nicht gemountet | `config/opencloud/apps` in docker-compose als Volume eintragen |
| 403 beim CardDAV-Zugriff | Falscher Auth-Typ | App-Token statt Bearer verwenden |
| Username leer | `onPremisesSamAccountName` beim Start nicht befüllt | `user.id` (UUID) verwenden |
| `GET /auth-app/tokens` liefert UUID | Falsche API-Nutzung | Immer `POST` für neuen Token |
| `CR:address-data` nicht geparst | DOMParser-Namespace-Problem | Regex statt DOMParser nutzen |
| `useRoute().params` undefined | OpenCloud-Router-Kontext | UID aus `window.location.pathname` lesen |
| `useRouter()` undefined | Falscher Import | Import von `@opencloud-eu/web-pkg` |
| Prev/Next-Pfeile reagieren nicht | `window.location.pathname` nicht reaktiv | UID in `ref` halten, beim Klick direkt setzen |
| Build erzeugt `.mjs` statt `.js` | Vite Default | Kein Problem – OpenCloud unterstützt `.mjs` |
| `public/manifest.json` blockiert | extension-sdk überspringt Generierung | `public/manifest.json` löschen |

### CSP – `unsafe-eval`

**Nicht nötig!** Vite 7 Production-Build erzeugt kein `eval()`. Nur Webpack Module Federation (Dev-Mode) benötigt es. In `csp.yaml` weglassen.

---

## 11. Server-Konfiguration

### `docker-compose.yml` – Apps-Volume

```yaml
services:
  opencloud:
    volumes:
      - ./config/opencloud/apps:/etc/ocis/apps:ro
```

### App-Verzeichnisstruktur auf dem Server

```
config/opencloud/apps/
└── contacts-test/
    ├── manifest.json          # Auto-generiert von extension-sdk
    ├── assets/
    │   └── *.css
    └── js/
        ├── remoteEntry-<hash>.mjs   # Einstiegspunkt
        └── *.mjs
```

---

## 12. CSP-Konfiguration

Minimale sichere CSP für OpenCloud-Extensions (`csp.yaml`):

```yaml
script-src:
  - 'self'
  - 'unsafe-inline'
  # 'unsafe-eval' wird NICHT benötigt (Vite 7 Production)
```

`unsafe-inline` wird von OpenCloud selbst für interne Styles benötigt und kann nicht entfernt werden.

---

## Neue Extension anlegen – Checkliste

- [ ] `pnpm create @opencloud-eu/extension` oder Projekt kopieren
- [ ] App-ID festlegen (= Verzeichnisname auf Server = URL-Präfix)
- [ ] `vite` als explizite devDep eintragen
- [ ] `vue3-gettext` auf exakte Version `2.3.4` pinnen
- [ ] `public/manifest.json` nicht anlegen
- [ ] `deploy.sh` mit korrektem `APP_NAME` und `REMOTE_*` konfigurieren
- [ ] CardDAV-Auth: App-Token-Flow implementieren (POST `/auth-app/tokens`)
- [ ] Router-Import: von `@opencloud-eu/web-pkg`, nicht `vue-router`
- [ ] CSP: kein `unsafe-eval`
