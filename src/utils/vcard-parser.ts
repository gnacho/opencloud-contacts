import type { Contact, ContactEmail, ContactPhone, ContactAddress } from '../types/contact'

/**
 * Unfolds vCard lines: continuation lines start with a space or tab.
 */
function unfold(raw: string): string {
  return raw.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '')
}

/**
 * Splits a vCard property line into name+params and value.
 * Example: "EMAIL;TYPE=INTERNET,WORK:foo@bar.com"
 *   -> { name: "EMAIL", params: { TYPE: "INTERNET,WORK" }, value: "foo@bar.com" }
 */
function parseLine(line: string): { name: string; params: Record<string, string>; value: string } {
  const colonIdx = line.indexOf(':')
  if (colonIdx === -1) return { name: line, params: {}, value: '' }

  const namePart = line.substring(0, colonIdx)
  const value = line.substring(colonIdx + 1)

  const segments = namePart.split(';')
  const name = segments[0].toUpperCase()
  const params: Record<string, string> = {}

  for (let i = 1; i < segments.length; i++) {
    const eqIdx = segments[i].indexOf('=')
    if (eqIdx === -1) {
      params[segments[i].toUpperCase()] = ''
    } else {
      params[segments[i].substring(0, eqIdx).toUpperCase()] = segments[i].substring(eqIdx + 1)
    }
  }

  return { name, params, value }
}

/**
 * Decodes quoted-printable encoding.
 */
function decodeQuotedPrintable(input: string): string {
  return input
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
}

/**
 * Decodes base64 (used for PHOTO;ENCODING=b or PHOTO;ENCODING=BASE64).
 */
function decodeBase64Photo(data: string, mimeType = 'image/jpeg'): string {
  const clean = data.replace(/\s/g, '')
  return `data:${mimeType};base64,${clean}`
}

/**
 * Parses a single vCard block (BEGIN:VCARD … END:VCARD) into a Contact object.
 */
export function parseVCard(raw: string, uid: string): Contact {
  const unfolded = unfold(raw)
  const lines = unfolded.split(/\r?\n/).filter((l) => l.trim())

  const contact: Contact = {
    uid,
    displayName: '',
    emails: [],
    phones: [],
    addresses: [],
    raw
  }

  for (const line of lines) {
    if (line.startsWith('BEGIN:') || line.startsWith('END:')) continue

    const { name, params, value } = parseLine(line)

    // Decode encoding if set
    const encoding = params['ENCODING']?.toUpperCase()
    let decoded = value
    if (encoding === 'QUOTED-PRINTABLE') {
      decoded = decodeQuotedPrintable(value)
      // Try UTF-8 decode if charset is specified
      if (params['CHARSET']?.toUpperCase() === 'UTF-8') {
        try {
          decoded = decodeURIComponent(escape(decoded))
        } catch {
          // keep as-is
        }
      }
    }

    switch (name) {
      case 'FN':
        contact.displayName = decoded.trim()
        break

      case 'N': {
        // N:Last;First;Middle;Prefix;Suffix
        const parts = decoded.split(';')
        contact.lastName = parts[0]?.trim() || undefined
        contact.firstName = parts[1]?.trim() || undefined
        contact.middleName = parts[2]?.trim() || undefined
        contact.prefix = parts[3]?.trim() || undefined
        contact.suffix = parts[4]?.trim() || undefined
        break
      }

      case 'UID':
        // Prefer the UID field as identifier
        contact.uid = decoded.trim() || uid
        break

      case 'ORG':
        contact.organization = decoded.split(';')[0].trim() || undefined
        break

      case 'TITLE':
        contact.title = decoded.trim() || undefined
        break

      case 'NOTE':
        contact.note = decoded.trim() || undefined
        break

      case 'NICKNAME':
        contact.nickname = decoded.trim() || undefined
        break

      case 'BDAY':
        contact.birthday = decoded.trim() || undefined
        break

      case 'URL':
        if (!contact.websites) contact.websites = []
        if (decoded.trim()) contact.websites.push(decoded.trim())
        break

      case 'EMAIL': {
        const typeRaw = params['TYPE'] ?? ''
        const emailTypes = typeRaw
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
        const email: ContactEmail = {
          value: decoded.trim(),
          type: emailTypes.length ? emailTypes.join(',') : undefined
        }
        if (email.value) contact.emails.push(email)
        break
      }

      case 'TEL': {
        const typeRaw = params['TYPE'] ?? ''
        const telTypes = typeRaw
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
        const phone: ContactPhone = {
          value: decoded.trim(),
          type: telTypes.length ? telTypes.join(',') : undefined
        }
        if (phone.value) contact.phones.push(phone)
        break
      }

      case 'ADR': {
        // ADR:POBox;Extended;Street;City;Region;PostalCode;Country
        const parts = decoded.split(';')
        const address: ContactAddress = {
          street: parts[2]?.trim() || undefined,
          city: parts[3]?.trim() || undefined,
          region: parts[4]?.trim() || undefined,
          postalCode: parts[5]?.trim() || undefined,
          country: parts[6]?.trim() || undefined
        }
        const typeRaw = params['TYPE'] ?? ''
        address.type = typeRaw || undefined
        if (Object.values(address).some((v) => v && v !== address.type)) {
          contact.addresses.push(address)
        }
        break
      }

      case 'PHOTO': {
        const valueType = params['VALUE']?.toUpperCase()
        if (valueType === 'URI' || valueType === 'URL') {
          contact.photoUrl = decoded.trim()
        } else if (encoding === 'B' || encoding === 'BASE64') {
          const mediaType = params['TYPE']?.toLowerCase() || 'jpeg'
          contact.photoUrl = decodeBase64Photo(decoded, `image/${mediaType}`)
        } else if (decoded.startsWith('http') || decoded.startsWith('data:')) {
          contact.photoUrl = decoded.trim()
        }
        break
      }
    }
  }

  // Fallback display name
  if (!contact.displayName) {
    const parts = [contact.prefix, contact.firstName, contact.middleName, contact.lastName, contact.suffix]
    const name = parts.filter(Boolean).join(' ').trim()
    contact.displayName = name || contact.organization || contact.emails[0]?.value || uid
  }

  return contact
}

/**
 * Parses a CardDAV REPORT XML response and returns all contacts.
 * The response contains multiple <response> elements, each with an
 * <address-data> element containing a vCard.
 */
export function parseCardDAVReport(xmlText: string): { href: string; vcardRaw: string }[] {
  const results: { href: string; vcardRaw: string }[] = []

  // Use regex to reliably extract href + vCard pairs regardless of XML namespace handling
  // Radicale returns <CR:address-data> which DOMParser may not handle consistently
  const responseRegex = /<[^:>]*:?response[^>]*>([\s\S]*?)<\/[^:>]*:?response>/gi
  let responseMatch: RegExpExecArray | null

  while ((responseMatch = responseRegex.exec(xmlText)) !== null) {
    const block = responseMatch[1]

    // Extract href
    const hrefMatch = /<[^:>]*:?href[^>]*>([\s\S]*?)<\/[^:>]*:?href>/i.exec(block)
    const href = hrefMatch ? hrefMatch[1].trim() : ''

    // Extract address-data (handles CR:address-data, C:address-data, address-data)
    const addrMatch = /<[^:>]*:?address-data[^>]*>([\s\S]*?)<\/[^:>]*:?address-data>/i.exec(block)
    const vcardRaw = addrMatch ? addrMatch[1].trim() : ''

    if (vcardRaw && vcardRaw.includes('BEGIN:VCARD')) {
      results.push({ href, vcardRaw })
    }
  }

  return results
}

/**
 * Parses a PROPFIND XML response and returns href paths of address books.
 */
export function parseAddressBookPropfind(xmlText: string): string[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlText, 'application/xml')

  const hrefs: string[] = []
  const responses = doc.querySelectorAll('response')

  for (const response of responses) {
    const resourceTypes = [...response.querySelectorAll('*')].filter(
      (el) => el.localName === 'resourcetype'
    )
    const isAddressBook = resourceTypes.some((rt) =>
      [...rt.children].some((child) => child.localName === 'addressbook')
    )
    if (isAddressBook) {
      const href = response.querySelector('href')?.textContent?.trim()
      if (href) hrefs.push(href)
    }
  }

  return hrefs
}
