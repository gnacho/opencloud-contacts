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

  /** Delete all contacts in all address books. Returns the number deleted. */
  async function deleteAllContacts(onProgress?: (done: number, total: number) => void): Promise<number> {
    const appToken = await getAppToken()
    const addressBooks = await discoverAddressBooks(appToken)
    const allHrefs: string[] = []

    for (const bookUrl of addressBooks) {
      const response = await fetch(bookUrl, {
        method: 'REPORT',
        headers: cardDAVHeaders(appToken, { Depth: '1' }),
        body: ADDRESSBOOK_QUERY
      })
      if (!response.ok) continue
      const xml = await response.text()
      const entries = parseCardDAVReport(xml)
      for (const { href } of entries) {
        allHrefs.push(href.startsWith('http') ? href : `${window.location.origin}${href}`)
      }
    }

    let done = 0
    for (const url of allHrefs) {
      await deleteContact(url, appToken)
      done++
      onProgress?.(done, allHrefs.length)
    }
    return done
  }

  /** Upload a single vCard to the first address book */
  async function putContact(uid: string, vcardData: string): Promise<void> {
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
    updateContact,
    deleteContactEntry,
    deleteAllContacts
  }
}
