import { ref, readonly } from 'vue'
import { useAuthStore, useUserStore } from '@opencloud-eu/web-pkg'
import { parseVCard, parseCardDAVReport, parseAddressBookPropfind } from '../utils/vcard-parser'
import { dedupeContacts } from '../utils/contact-dedup'
import { useContactStore } from './useContactStore'
import type { Contact } from '../types/contact'

/**
 * Thrown when an update is rejected with 412 Precondition Failed: the stored
 * vCard changed on the server (another client, another tab) after it was
 * loaded. Callers surface this to the user instead of treating it as a
 * generic failure — the remote change must be reloaded, not overwritten.
 */
export class ContactConflictError extends Error {
  constructor(href: string) {
    super(`Contact changed on the server: ${href} (412 Precondition Failed)`)
    this.name = 'ContactConflictError'
  }
}

const PROPFIND_BODY = `<?xml version="1.0" encoding="utf-8" ?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav">
  <D:prop>
    <D:resourcetype/>
    <D:displayname/>
    <C:addressbook-description/>
  </D:prop>
</D:propfind>`

const ADDRESSBOOK_QUERY = `<?xml version="1.0" encoding="utf-8" ?>
<C:addressbook-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav">
  <D:prop>
    <D:getetag/>
    <C:address-data/>
  </D:prop>
</C:addressbook-query>`

// Lightweight PROPFIND to list all items in a collection — used for delete
// where we want every href regardless of vCard validity
const LIST_ITEMS_PROPFIND = `<?xml version="1.0" encoding="utf-8" ?>
<D:propfind xmlns:D="DAV:">
  <D:prop><D:resourcetype/></D:prop>
</D:propfind>`

// App tokens act as account-wide app passwords, so they are kept in memory only
// (never in localStorage) and are short-lived. A page reload simply creates a new one.
const TOKEN_EXPIRY = '1h'
const TOKEN_EXPIRY_MS = 60 * 60 * 1000 // matches server-side expiry=1h
const TOKEN_RENEW_MARGIN_MS = 5 * 60 * 1000 // renew early so long batches don't hit expiry

// Tokens from older versions were persisted under this prefix — migrated away on first use.
const LEGACY_TOKEN_KEY_PREFIX = 'oc-contacts-app-token-'

interface StoredToken { token: string; expiresAt: number }

// In-memory token cache keyed by userId.
const tokenCache = new Map<string, StoredToken>()

function loadStoredToken(userId: string): string | null {
  const stored = tokenCache.get(userId)
  if (!stored) return null
  if (Date.now() >= stored.expiresAt - TOKEN_RENEW_MARGIN_MS) {
    tokenCache.delete(userId)
    return null
  }
  return stored.token
}

function saveToken(userId: string, token: string): void {
  tokenCache.set(userId, { token, expiresAt: Date.now() + TOKEN_EXPIRY_MS })
}

function revokeToken(token: string, bearerToken: string, keepalive = false): Promise<unknown> {
  return fetch(`/auth-app/tokens?token=${encodeURIComponent(token)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${bearerToken}` },
    keepalive
  }).catch(() => {})
}

/**
 * Remove app tokens persisted in localStorage by older versions. The current
 * user's token is revoked server-side; other users' tokens can't be revoked
 * with this bearer token and are only removed locally (they expire within 24h).
 */
function migrateLegacyTokens(userId: string, bearerToken: string): void {
  try {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith(LEGACY_TOKEN_KEY_PREFIX))
    for (const key of keys) {
      const raw = localStorage.getItem(key)
      localStorage.removeItem(key)
      if (key !== `${LEGACY_TOKEN_KEY_PREFIX}${userId}` || !raw) continue
      const { token } = JSON.parse(raw) as StoredToken
      if (token) revokeToken(token, bearerToken)
    }
  } catch {
    // Storage unavailable or malformed entry — nothing to migrate
  }
}

// Module-level counter so concurrent loadContacts() calls across any component
// instance can detect stale writes. Incremented at the start of every load;
// only the latest invocation is allowed to commit results to the store.
let loadEpoch = 0

// In-flight token requests keyed by userId — prevents two concurrent callers
// from each triggering a separate POST /auth-app/tokens.
const tokenRequestsInFlight = new Map<string, Promise<string>>()

// Track which users have had expired tokens purged this session.
const purgedThisSession = new Set<string>()

// Track which users have had legacy localStorage tokens migrated this session.
const migratedThisSession = new Set<string>()

let pageLifecycleHooked = false

export function useCardDAV() {
  const authStore = useAuthStore()
  const userStore = useUserStore()
  const contactStore = useContactStore()

  if (!pageLifecycleHooked) {
    pageLifecycleHooked = true
    // Best effort: revoke tokens when the page is left (reload, tab close, logout
    // redirect). keepalive lets the request outlive the page. If the bearer token
    // is already gone, the server-side expiry is the backstop.
    window.addEventListener('pagehide', () => {
      const bearerToken = authStore.accessToken
      if (bearerToken) {
        for (const { token } of tokenCache.values()) revokeToken(token, bearerToken, true)
      }
      tokenCache.clear()
    })
  }

  const contacts = ref<Contact[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  function getUsername(): string {
    const u = userStore.user
    return u?.onPremisesSamAccountName || u?.id || ''
  }

  function getCardDAVBase(): string {
    return `${window.location.origin}/carddav`
  }

  function getUserPath(): string {
    const uuid = userStore.user?.id
    if (uuid) return `${getCardDAVBase()}/${uuid}/`
    return `${getCardDAVBase()}/${encodeURIComponent(getUsername())}/`
  }

  function basicAuthHeader(token: string): string {
    return `Basic ${btoa(`${getUsername()}:${token}`)}`
  }

  /**
   * If a response indicates the app token is invalid, evict it from the cache
   * so the next operation creates a fresh one. Call this after every fetch.
   */
  function evictTokenOnAuthFailure(status: number): void {
    if (status === 401 || status === 403) {
      const userId = userStore.user?.id
      if (userId) tokenCache.delete(userId)
    }
  }

  function cardDAVHeaders(appToken: string, extra: Record<string, string> = {}): Record<string, string> {
    return {
      Authorization: basicAuthHeader(appToken),
      'Content-Type': 'application/xml; charset=utf-8',
      ...extra
    }
  }

  /** Delete expired contacts-app tokens to avoid accumulation without invalidating other devices. */
  async function purgeExpiredAppTokens(bearerToken: string): Promise<void> {
    try {
      const resp = await fetch('/auth-app/tokens', {
        headers: { Authorization: `Bearer ${bearerToken}` }
      })
      if (!resp.ok) return
      const tokens = await resp.json() as Array<{ token: string; label: string; expiration_date: string }>
      const now = new Date()
      await Promise.all(
        tokens
          .filter((t) => t.label === 'contacts-app' && new Date(t.expiration_date) <= now)
          .map((t) => revokeToken(t.token, bearerToken))
      )
    } catch {
      // Non-critical — ignore errors during cleanup
    }
  }

  /** Create a new app token via the auth-app API */
  async function createAppToken(bearerToken: string): Promise<string> {
    await purgeExpiredAppTokens(bearerToken)
    const resp = await fetch(`/auth-app/tokens?expiry=${TOKEN_EXPIRY}&label=contacts-app`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${bearerToken}` }
    })
    if (!resp.ok) {
      throw new Error(`Failed to create app token: ${resp.status} ${resp.statusText}`)
    }
    const data = await resp.json() as { token: string }
    return data.token
  }

  /** Get or create a cached app token for CardDAV Basic Auth */
  async function getAppToken(): Promise<string> {
    const userId = userStore.user?.id
    if (!userId) throw new Error('No user logged in')

    const cached = loadStoredToken(userId)
    if (cached) return cached

    // Deduplicate concurrent token creation requests for the same user.
    const inflight = tokenRequestsInFlight.get(userId)
    if (inflight) return inflight

    const bearerToken = authStore.accessToken
    if (!bearerToken) throw new Error('No access token available')

    if (!migratedThisSession.has(userId)) {
      migratedThisSession.add(userId)
      migrateLegacyTokens(userId, bearerToken)
    }

    const request = createAppToken(bearerToken).then((token) => {
      saveToken(userId, token)
      tokenRequestsInFlight.delete(userId)
      return token
    }).catch((err) => {
      tokenRequestsInFlight.delete(userId)
      throw err
    })

    tokenRequestsInFlight.set(userId, request)
    return request
  }

  /**
   * Resolve a server-supplied href to a full URL and verify it is same-origin
   * and within the /carddav/ path. Throws otherwise — prevents a compromised
   * CardDAV server from redirecting Authorization headers to internal endpoints
   * (e.g. /auth-app/tokens) or external hosts.
   */
  function resolveCardDAVUrl(href: string): string {
    const resolved = href.startsWith('http')
      ? href
      : `${window.location.origin}${href}`
    const url = new URL(resolved)
    if (url.origin !== window.location.origin) {
      throw new Error(`Rejected CardDAV URL with unexpected origin: ${url.origin}`)
    }
    if (!url.pathname.startsWith('/carddav/')) {
      throw new Error(`Rejected CardDAV URL outside /carddav/ path: ${url.pathname}`)
    }
    return resolved
  }

  async function discoverAddressBooks(appToken: string): Promise<string[]> {
    const url = getUserPath()
    const response = await fetch(url, {
      method: 'PROPFIND',
      headers: cardDAVHeaders(appToken, { Depth: '1' }),
      body: PROPFIND_BODY
    })

    if (!response.ok) {
      evictTokenOnAuthFailure(response.status)
      throw new Error(`PROPFIND failed: ${response.status} ${response.statusText}`)
    }

    const xml = await response.text()
    const books = parseAddressBookPropfind(xml)

    if (books.length === 0) return [url]

    return books.map((href) => resolveCardDAVUrl(href))
  }

  async function fetchContactsFromBook(bookUrl: string, appToken: string): Promise<Contact[]> {
    const response = await fetch(bookUrl, {
      method: 'REPORT',
      headers: cardDAVHeaders(appToken, { Depth: '1' }),
      body: ADDRESSBOOK_QUERY
    })

    if (!response.ok) {
      evictTokenOnAuthFailure(response.status)
      throw new Error(`REPORT failed for ${bookUrl}: ${response.status} ${response.statusText}`)
    }

    const xml = await response.text()
    const entries = parseCardDAVReport(xml)

    return entries.map(({ href, vcardRaw, etag }) => {
      const uid = href.split('/').filter(Boolean).pop() ?? href
      const contact = parseVCard(vcardRaw, uid)
      contact.href = resolveCardDAVUrl(href)
      contact.etag = etag
      return contact
    })
  }

  async function loadContacts(retried = false): Promise<void> {
    const epoch = ++loadEpoch
    loading.value = true
    error.value = null
    try {
      const appToken = await getAppToken()

      // Purge stale contacts-app tokens once per session. Done here because
      // the bearer token is guaranteed to be available after getAppToken().
      const userId = userStore.user?.id
      if (userId && !purgedThisSession.has(userId)) {
        purgedThisSession.add(userId)
        const bearerToken = authStore.accessToken
        if (bearerToken) purgeExpiredAppTokens(bearerToken).catch(() => {})
      }
      const addressBooks = await discoverAddressBooks(appToken)
      const allContacts: Contact[] = []

      for (const bookUrl of addressBooks) {
        const bookContacts = await fetchContactsFromBook(bookUrl, appToken)
        allContacts.push(...bookContacts)
      }

      if (epoch !== loadEpoch) return // stale — a newer load has started

      const deduped = dedupeContacts(allContacts)
      contacts.value = deduped
      contactStore.setContacts(deduped)
    } catch (err) {
      if (epoch !== loadEpoch) return // stale — discard error from superseded load
      // If the cached token was manually revoked on the server, evictTokenOnAuthFailure
      // already removed it from the cache — retry once to get a fresh token.
      const is401 = err instanceof Error && /40[13]/.test(err.message)
      if (is401 && !retried) {
        return loadContacts(true)
      }
      error.value = err instanceof Error ? err.message : String(err)
      console.error('[useCardDAV] Error loading contacts:', err)
    } finally {
      if (epoch === loadEpoch) loading.value = false
    }
  }

  /** Delete a single contact by its full URL */
  async function deleteContact(url: string, appToken: string): Promise<void> {
    const response = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: basicAuthHeader(appToken) }
    })
    if (!response.ok && response.status !== 404) {
      evictTokenOnAuthFailure(response.status)
      throw new Error(`DELETE failed for ${url}: ${response.status} ${response.statusText}`)
    }
  }

  /** Delete all contacts in all address books using a sliding window for speed. */
  async function deleteAllContacts(onProgress?: (done: number, total: number) => void): Promise<number> {
    const appToken = await getAppToken()
    const addressBooks = await discoverAddressBooks(appToken)
    const allHrefs: string[] = []

    for (const bookUrl of addressBooks) {
      // Use PROPFIND (not REPORT) so we get ALL hrefs regardless of vCard validity.
      // parseCardDAVReport filters on BEGIN:VCARD content and would miss broken entries.
      const response = await fetch(bookUrl, {
        method: 'PROPFIND',
        headers: cardDAVHeaders(appToken, { Depth: '1' }),
        body: LIST_ITEMS_PROPFIND
      })
      if (!response.ok) {
        evictTokenOnAuthFailure(response.status)
        throw new Error(`PROPFIND failed for ${bookUrl}: ${response.status} ${response.statusText}`)
      }
      const xml = await response.text()
      // Extract every href that is a resource (not a collection).
      // Collections end with '/' or resolve to the address book URL itself.
      const bookPath = new URL(bookUrl).pathname
      const hrefRegex = /<[^:>]*:?href[^>]*>([\s\S]*?)<\/[^:>]*:?href>/gi
      let m: RegExpExecArray | null
      while ((m = hrefRegex.exec(xml)) !== null) {
        const href = m[1].trim()
        if (href.endsWith('/')) continue
        const path = href.startsWith('http') ? new URL(href).pathname : href
        if (path === bookPath) continue
        try {
          allHrefs.push(resolveCardDAVUrl(href))
        } catch {
          // Skip hrefs pointing to unexpected origins
        }
      }
    }

    const total = allHrefs.length
    let done = 0
    onProgress?.(0, total)

    const CONCURRENCY = 20
    const queue = [...allHrefs]
    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length > 0) {
        const url = queue.shift()!
        await deleteContact(url, appToken)
        onProgress?.(++done, total)
      }
    })
    await Promise.all(workers)
    return done
  }

  /** Upload a single vCard to the first address book; returns the CardDAV href */
  async function putContact(uid: string, vcardData: string): Promise<string> {
    const appToken = await getAppToken()
    const addressBooks = await discoverAddressBooks(appToken)
    if (!addressBooks.length) throw new Error('No address book found')

    const bookUrl = addressBooks[0]
    const url = bookUrl.endsWith('/') ? `${bookUrl}${uid}.vcf` : `${bookUrl}/${uid}.vcf`

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        ...cardDAVHeaders(appToken),
        'Content-Type': 'text/vcard; charset=utf-8',
        'If-None-Match': '*'
      },
      body: vcardData
    })

    if (!response.ok && response.status !== 201 && response.status !== 204) {
      evictTokenOnAuthFailure(response.status)
      throw new Error(`PUT failed for ${uid}: ${response.status} ${response.statusText}`)
    }

    return url
  }

  /**
   * Upload multiple vCards in parallel batches.
   * Fetches app token and address book URL only once for the entire batch.
   */
  async function putContactsBatch(
    items: { uid: string; vcard: string }[],
    onProgress?: (done: number, total: number) => void
  ): Promise<{ uid: string; href: string; error?: string }[]> {
    const appToken = await getAppToken()
    const addressBooks = await discoverAddressBooks(appToken)
    if (!addressBooks.length) throw new Error('No address book found')

    const bookUrl = addressBooks[0]
    const results: { uid: string; href: string; error?: string }[] = new Array(items.length)
    let completed = 0

    // Sliding window concurrency: keeps CONCURRENCY requests in-flight at all times.
    // Pure sequential wastes RTT waiting for each response; large batches cause
    // Radicale file-lock contention. 5 concurrent hits the sweet spot.
    const CONCURRENCY = 20
    const queue = items.map((item, index) => ({ ...item, index }))
    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length > 0) {
        const { uid, vcard, index } = queue.shift()!
        const url = bookUrl.endsWith('/') ? `${bookUrl}${uid}.vcf` : `${bookUrl}/${uid}.vcf`
        try {
          const response = await fetch(url, {
            method: 'PUT',
            headers: {
              ...cardDAVHeaders(appToken),
              'Content-Type': 'text/vcard; charset=utf-8',
              'If-None-Match': '*'
            },
            body: vcard
          })
          if (!response.ok && response.status !== 201 && response.status !== 204) {
            evictTokenOnAuthFailure(response.status)
            throw new Error(`PUT failed: ${response.status} ${response.statusText}`)
          }
          results[index] = { uid, href: url }
        } catch (err) {
          results[index] = { uid, href: url, error: err instanceof Error ? err.message : String(err) }
        }
        onProgress?.(++completed, items.length)
      }
    })
    await Promise.all(workers)
    return results
  }

  /** Update multiple existing contacts in parallel (sliding window).
   *  Sends If-Match when an etag is known; a 412 marks the item as conflict
   *  instead of failing the whole batch. Returns the fresh ETag per item. */
  async function updateContactsBatch(
    items: { href: string; vcard: string; etag?: string }[],
    onProgress?: (done: number, total: number) => void
  ): Promise<{ href: string; etag?: string; error?: string; conflict?: boolean }[]> {
    const appToken = await getAppToken()
    const results: { href: string; etag?: string; error?: string; conflict?: boolean }[] = new Array(items.length)
    let completed = 0

    const CONCURRENCY = 20
    const queue = items.map((item, index) => ({ ...item, index }))
    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length > 0) {
        const { href, vcard, etag, index } = queue.shift()!
        try {
          const headers: Record<string, string> = {
            ...cardDAVHeaders(appToken),
            'Content-Type': 'text/vcard; charset=utf-8'
          }
          if (etag) headers['If-Match'] = etag
          const response = await fetch(href, {
            method: 'PUT',
            headers,
            body: vcard
          })
          if (response.status === 412) {
            results[index] = { href, conflict: true }
          } else if (!response.ok && response.status !== 201 && response.status !== 204) {
            evictTokenOnAuthFailure(response.status)
            throw new Error(`PUT failed: ${response.status} ${response.statusText}`)
          } else {
            results[index] = { href, etag: response.headers.get('ETag') ?? undefined }
          }
        } catch (err) {
          results[index] = { href, error: err instanceof Error ? err.message : String(err) }
        }
        onProgress?.(++completed, items.length)
      }
    })
    await Promise.all(workers)
    return results
  }

  /** Update an existing contact (PUT with its known href).
   *  Sends If-Match when an etag is known, so a concurrent change from another
   *  client surfaces as ContactConflictError (412) instead of being silently
   *  overwritten. Returns the fresh ETag from the response, if provided. */
  async function updateContact(href: string, vcardData: string, etag?: string): Promise<string | undefined> {
    const appToken = await getAppToken()
    const headers: Record<string, string> = {
      ...cardDAVHeaders(appToken),
      'Content-Type': 'text/vcard; charset=utf-8'
    }
    if (etag) headers['If-Match'] = etag
    const response = await fetch(href, {
      method: 'PUT',
      headers,
      body: vcardData
    })
    if (response.status === 412) throw new ContactConflictError(href)
    if (!response.ok && response.status !== 201 && response.status !== 204) {
      evictTokenOnAuthFailure(response.status)
      throw new Error(`PUT failed: ${response.status} ${response.statusText}`)
    }
    return response.headers.get('ETag') ?? undefined
  }

  /** Delete a single contact by its CardDAV href */
  async function deleteContactEntry(href: string): Promise<void> {
    const appToken = await getAppToken()
    await deleteContact(href, appToken)
  }

  /**
   * Drop all cached app tokens (logout / user switch). Revocation is attempted
   * with the current bearer token if one is still available; the server rejects
   * tokens of other users, so failures are ignored.
   */
  function discardAppTokens(): void {
    const bearerToken = authStore.accessToken
    if (bearerToken) {
      for (const { token } of tokenCache.values()) revokeToken(token, bearerToken)
    }
    tokenCache.clear()
  }

  return {
    contacts: readonly(contacts),
    loading: readonly(loading),
    error: readonly(error),
    ContactConflictError,
    loadContacts,
    putContact,
    putContactsBatch,
    updateContactsBatch,
    updateContact,
    deleteContactEntry,
    deleteAllContacts,
    discardAppTokens
  }
}
