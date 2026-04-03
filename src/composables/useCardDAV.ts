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

const APP_TOKEN_KEY = 'oc-contacts-app-token'

export function useCardDAV() {
  const authStore = useAuthStore()
  const userStore = useUserStore()
  const contactStore = useContactStore()

  const contacts = ref<Contact[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  function getUsername(): string {
    const u = userStore.user
    return u?.onPremisesSamAccountName || u?.displayName || ''
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

  function cardDAVHeaders(appToken: string, extra: Record<string, string> = {}): HeadersInit {
    return {
      Authorization: basicAuthHeader(appToken),
      'Content-Type': 'application/xml; charset=utf-8',
      ...extra
    }
  }

  /** Create a new app token via the auth-app API */
  async function createAppToken(bearerToken: string): Promise<string> {
    const resp = await fetch('/auth-app/tokens?expiry=72h&label=contacts-app', {
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
    // Check sessionStorage first
    const cached = sessionStorage.getItem(APP_TOKEN_KEY)
    if (cached) return cached

    const bearerToken = authStore.accessToken
    if (!bearerToken) throw new Error('No access token available')

    // Always create a new token (GET /auth-app/tokens returns UUIDs, not usable tokens)
    const token = await createAppToken(bearerToken)

    sessionStorage.setItem(APP_TOKEN_KEY, token)
    return token
  }

  async function discoverAddressBooks(appToken: string): Promise<string[]> {
    const url = getUserPath()
    const response = await fetch(url, {
      method: 'PROPFIND',
      headers: cardDAVHeaders(appToken, { Depth: '1' }),
      body: PROPFIND_BODY
    })

    if (!response.ok) {
      // Clear cached token on auth failure so next call retries
      if (response.status === 401 || response.status === 403) {
        sessionStorage.removeItem(APP_TOKEN_KEY)
      }
      throw new Error(`PROPFIND failed: ${response.status} ${response.statusText}`)
    }

    const xml = await response.text()
    const books = parseAddressBookPropfind(xml)

    if (books.length === 0) return [url]

    return books.map((href) => {
      if (href.startsWith('http')) return href
      return `${window.location.origin}${href}`
    })
  }

  async function fetchContactsFromBook(bookUrl: string, appToken: string): Promise<Contact[]> {
    const response = await fetch(bookUrl, {
      method: 'REPORT',
      headers: cardDAVHeaders(appToken, { Depth: '1' }),
      body: ADDRESSBOOK_QUERY
    })

    if (!response.ok) {
      throw new Error(`REPORT failed for ${bookUrl}: ${response.status} ${response.statusText}`)
    }

    const xml = await response.text()
    const entries = parseCardDAVReport(xml)

    return entries.map(({ href, vcardRaw }) => {
      const uid = href.split('/').filter(Boolean).pop() ?? href
      const contact = parseVCard(vcardRaw, uid)
      contact.href = href.startsWith('http') ? href : `${window.location.origin}${href}`
      return contact
    })
  }

  async function loadContacts(): Promise<void> {
    loading.value = true
    error.value = null

    try {
      const appToken = await getAppToken()
      const addressBooks = await discoverAddressBooks(appToken)
      const allContacts: Contact[] = []

      for (const bookUrl of addressBooks) {
        const bookContacts = await fetchContactsFromBook(bookUrl, appToken)
        allContacts.push(...bookContacts)
      }

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
      error.value = err instanceof Error ? err.message : String(err)
      console.error('[useCardDAV] Error loading contacts:', err)
    } finally {
      loading.value = false
    }
  }

  /** Delete a single contact by its full URL */
  async function deleteContact(url: string, appToken: string): Promise<void> {
    const response = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: basicAuthHeader(appToken) }
    })
    if (!response.ok && response.status !== 404) {
      throw new Error(`DELETE failed for ${url}: ${response.status} ${response.statusText}`)
    }
  }

  /**
   * Delete all contacts by wiping each address book collection and recreating it.
   * This is a single DELETE + MKCOL per address book instead of N individual DELETEs,
   * which avoids Radicale's file-lock contention on concurrent single-item deletes.
   */
  async function deleteAllContacts(onProgress?: (done: number, total: number) => void): Promise<number> {
    const appToken = await getAppToken()
    const addressBooks = await discoverAddressBooks(appToken)

    // Count existing contacts for progress reporting
    let total = 0
    const bookEntries: { bookUrl: string; count: number }[] = []
    for (const bookUrl of addressBooks) {
      const response = await fetch(bookUrl, {
        method: 'REPORT',
        headers: cardDAVHeaders(appToken, { Depth: '1' }),
        body: ADDRESSBOOK_QUERY
      })
      if (!response.ok) continue
      const xml = await response.text()
      const count = parseCardDAVReport(xml).length
      bookEntries.push({ bookUrl, count })
      total += count
    }

    onProgress?.(0, total)

    let done = 0
    for (const { bookUrl, count } of bookEntries) {
      // Safety guard: only wipe collections that were returned by discoverAddressBooks,
      // which filters strictly for CardDAV addressbook resource type (not calendars).
      if (!addressBooks.includes(bookUrl)) {
        throw new Error(`Safety check failed: refusing to delete non-addressbook URL: ${bookUrl}`)
      }

      // DELETE the entire collection (one request)
      const delResp = await fetch(bookUrl, {
        method: 'DELETE',
        headers: { Authorization: basicAuthHeader(appToken) }
      })
      if (!delResp.ok && delResp.status !== 404) {
        throw new Error(`DELETE collection failed: ${delResp.status} ${delResp.statusText}`)
      }

      // Recreate the address book collection (Extended MKCOL, RFC 5689)
      const mkcolResp = await fetch(bookUrl, {
        method: 'MKCOL',
        headers: {
          Authorization: basicAuthHeader(appToken),
          'Content-Type': 'application/xml; charset=utf-8'
        },
        body: `<?xml version="1.0" encoding="utf-8"?>
<D:mkcol xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav">
  <D:set>
    <D:prop>
      <D:resourcetype><D:collection/><C:addressbook/></D:resourcetype>
      <D:displayname>Contacts</D:displayname>
    </D:prop>
  </D:set>
</D:mkcol>`
      })
      if (!mkcolResp.ok && mkcolResp.status !== 201) {
        throw new Error(`MKCOL failed: ${mkcolResp.status} ${mkcolResp.statusText}`)
      }

      done += count
      onProgress?.(done, total)
    }

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
    const CONCURRENCY = 5
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
    updateContact,
    deleteContactEntry,
    deleteAllContacts
  }
}
