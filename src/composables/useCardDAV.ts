import { ref, readonly } from 'vue'
import { useAuthStore, useUserStore } from '@opencloud-eu/web-pkg'
import { parseVCard, parseCardDAVReport, parseAddressBookPropfind } from '../utils/vcard-parser'
import { useContactStore } from './useContactStore'
import type { Contact } from '../types/contact'

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

const APP_TOKEN_KEY_PREFIX = 'oc-contacts-app-token'

function appTokenKey(userId: string): string {
  return `${APP_TOKEN_KEY_PREFIX}-${userId}`
}

// Module-level counter so concurrent loadContacts() calls across any component
// instance can detect stale writes. Incremented at the start of every load;
// only the latest invocation is allowed to commit results to the store.
let loadEpoch = 0

// In-flight token requests keyed by userId — prevents two concurrent callers
// from each triggering a separate POST /auth-app/tokens.
const tokenRequestsInFlight = new Map<string, Promise<string>>()

// Track which users have had stale tokens purged this session.
const purgedThisSession = new Set<string>()

export function useCardDAV() {
  const authStore = useAuthStore()
  const userStore = useUserStore()
  const contactStore = useContactStore()

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
      if (userId) localStorage.removeItem(appTokenKey(userId))
    }
  }

  function cardDAVHeaders(appToken: string, extra: Record<string, string> = {}): HeadersInit {
    return {
      Authorization: basicAuthHeader(appToken),
      'Content-Type': 'application/xml; charset=utf-8',
      ...extra
    }
  }

  /** Delete ALL contacts-app tokens before creating a new one to avoid accumulation. */
  async function purgeContactsAppTokens(bearerToken: string): Promise<void> {
    try {
      const resp = await fetch('/auth-app/tokens', {
        headers: { Authorization: `Bearer ${bearerToken}` }
      })
      if (!resp.ok) { console.warn('[purge] GET failed', resp.status); return }
      const tokens = await resp.json()
      console.log('[purge] all tokens:', JSON.stringify(tokens))
      const mine = (tokens as Array<{ id: string; note: string }>)
        .filter((t) => t.note === 'contacts-app')
      console.log('[purge] to delete:', mine.length)
      await Promise.all(
        mine.map(async (t) => {
          const r = await fetch(`/auth-app/tokens/${t.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${bearerToken}` }
          })
          console.log('[purge] DELETE', t.id, r.status)
        })
      )
    } catch (e) {
      console.error('[purge] error:', e)
    }
  }

  /** Create a new app token via the auth-app API */
  async function createAppToken(bearerToken: string): Promise<string> {
    await purgeContactsAppTokens(bearerToken)
    const resp = await fetch('/auth-app/tokens?expiry=24h&label=contacts-app', {
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

    // Persist in localStorage so the token survives browser restarts.
    // Keyed per user so switching accounts never mixes tokens.
    const key = appTokenKey(userId)
    const cached = localStorage.getItem(key)

    if (cached) return cached

    // Deduplicate concurrent token creation requests for the same user.
    const inflight = tokenRequestsInFlight.get(userId)
    if (inflight) return inflight

    const bearerToken = authStore.accessToken
    if (!bearerToken) throw new Error('No access token available')

    const request = createAppToken(bearerToken).then((token) => {
      localStorage.setItem(key, token)
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

    return entries.map(({ href, vcardRaw }) => {
      const uid = href.split('/').filter(Boolean).pop() ?? href
      const contact = parseVCard(vcardRaw, uid)
      contact.href = resolveCardDAVUrl(href)
      return contact
    })
  }

  async function loadContacts(retried = false): Promise<void> {
    const epoch = ++loadEpoch
    loading.value = true
    error.value = null
    console.log('[loadContacts] start, userId:', userStore.user?.id, 'bearerToken:', !!authStore.accessToken)

    try {
      const appToken = await getAppToken()
      console.log('[loadContacts] appToken ok, purged?', purgedThisSession.has(userStore.user?.id ?? ''))

      // Purge stale contacts-app tokens once per session. Done here because
      // the bearer token is guaranteed to be available after getAppToken().
      const userId = userStore.user?.id
      if (userId && !purgedThisSession.has(userId)) {
        purgedThisSession.add(userId)
        const bearerToken = authStore.accessToken
        console.log('[loadContacts] firing purge, bearerToken:', !!bearerToken)
        if (bearerToken) purgeContactsAppTokens(bearerToken).catch(() => {})
      }
      const addressBooks = await discoverAddressBooks(appToken)
      const allContacts: Contact[] = []

      for (const bookUrl of addressBooks) {
        const bookContacts = await fetchContactsFromBook(bookUrl, appToken)
        allContacts.push(...bookContacts)
      }

      if (epoch !== loadEpoch) return // stale — a newer load has started

      // Deduplicate by UID
      const seen = new Set<string>()
      const deduped = allContacts.filter((c) => {
        if (seen.has(c.uid)) return false
        seen.add(c.uid)
        return true
      })
      contacts.value = deduped
      contactStore.setContacts(deduped)
    } catch (err) {
      if (epoch !== loadEpoch) return // stale — discard error from superseded load
      // If the cached token was manually revoked on the server, evictTokenOnAuthFailure
      // already removed it from localStorage — retry once to get a fresh token.
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

  /** Update multiple existing contacts in parallel (sliding window). */
  async function updateContactsBatch(
    items: { href: string; vcard: string }[],
    onProgress?: (done: number, total: number) => void
  ): Promise<{ href: string; error?: string }[]> {
    const appToken = await getAppToken()
    const results: { href: string; error?: string }[] = new Array(items.length)
    let completed = 0

    const CONCURRENCY = 20
    const queue = items.map((item, index) => ({ ...item, index }))
    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length > 0) {
        const { href, vcard, index } = queue.shift()!
        try {
          const response = await fetch(href, {
            method: 'PUT',
            headers: { ...cardDAVHeaders(appToken), 'Content-Type': 'text/vcard; charset=utf-8' },
            body: vcard
          })
          if (!response.ok && response.status !== 201 && response.status !== 204) {
            evictTokenOnAuthFailure(response.status)
            throw new Error(`PUT failed: ${response.status} ${response.statusText}`)
          }
          results[index] = { href }
        } catch (err) {
          results[index] = { href, error: err instanceof Error ? err.message : String(err) }
        }
        onProgress?.(++completed, items.length)
      }
    })
    await Promise.all(workers)
    return results
  }

  /** Update an existing contact (PUT with its known href) */
  async function updateContact(href: string, vcardData: string): Promise<void> {
    const appToken = await getAppToken()
    const response = await fetch(href, {
      method: 'PUT',
      headers: {
        ...cardDAVHeaders(appToken),
        'Content-Type': 'text/vcard; charset=utf-8'
      },
      body: vcardData
    })
    if (!response.ok && response.status !== 201 && response.status !== 204) {
      evictTokenOnAuthFailure(response.status)
      throw new Error(`PUT failed: ${response.status} ${response.statusText}`)
    }
  }

  /** Delete a single contact by its CardDAV href */
  async function deleteContactEntry(href: string): Promise<void> {
    const appToken = await getAppToken()
    await deleteContact(href, appToken)
  }

  return {
    contacts: readonly(contacts),
    loading: readonly(loading),
    error: readonly(error),
    loadContacts,
    putContact,
    putContactsBatch,
    updateContactsBatch,
    updateContact,
    deleteContactEntry,
    deleteAllContacts
  }
}
