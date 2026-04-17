import type { Contact, ContactEmail, ContactPhone, ContactAddress } from '../types/contact'

/**
 * Unfolds vCard lines: continuation lines start with a space or tab.
 * QUOTED-PRINTABLE soft-breaks (=\r\n + optional whitespace) are stripped
 * first so the QP escape character is not left dangling after standard unfold.
 */
function unfold(raw: string): string {
  return raw
    .replace(/=\r\n[ \t]?/g, '')   // QP soft-break (RFC 2045 §6.7)
    .replace(/\r\n[ \t]/g, '')     // standard vCard fold
    .replace(/\n[ \t]/g, '')       // LF-only fold
}

/**
 * Unescape vCard text values (RFC 6350 §3.4).
 * Single-pass so \\n → \n and \\\\ → \\ are handled correctly.
 */
function unescapeVCard(value: string): string {
  return value.replace(/\\(\\|n|N|,|;)/g, (_, c) => {
    if (c === 'n' || c === 'N') return '\n'
    if (c === ',') return ','
    if (c === ';') return ';'
    if (c === '\\') return '\\'
    return c
  })
}

/**
 * Split a vCard list value on a delimiter char that is NOT escaped.
 * Used for ';' (structured values) and ',' (CATEGORIES).
 */
function splitOnUnescaped(value: string, delimiter: string): string[] {
  const parts: string[] = []
  let current = ''
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '\\' && i + 1 < value.length) {
      current += value[i] + value[i + 1]
      i++
    } else if (value[i] === delimiter) {
      parts.push(current)
      current = ''
    } else {
      current += value[i]
    }
  }
  parts.push(current)
  return parts
}

/**
 * Split a vCard structured value on ';' that are NOT escaped (i.e. not preceded by \).
 * Example: "Doe\\;Smith;Jane" → ["Doe\\;Smith", "Jane"]
 * Each component is then passed through unescapeVCard by the caller.
 */
function splitStructured(value: string): string[] {
  return splitOnUnescaped(value, ';')
}

/**
 * Splits a vCard property line into name+params and value.
 * Example: "EMAIL;TYPE=INTERNET,WORK:foo@bar.com"
 *   → { name: "EMAIL", params: { TYPE: "INTERNET,WORK" }, value: "foo@bar.com" }
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
      // Bare flag: e.g. EMAIL;WORK;INTERNET:... — store as key with empty value
      params[segments[i].toUpperCase()] = ''
    } else {
      params[segments[i].substring(0, eqIdx).toUpperCase()] = segments[i].substring(eqIdx + 1)
    }
  }

  return { name, params, value }
}

/**
 * Resolve type string from params.
 * Handles both TYPE=WORK and bare flags (EMAIL;WORK;INTERNET:...).
 * Non-type param keys (ENCODING, CHARSET, VALUE, LANGUAGE) are excluded.
 */
const PARAM_META_KEYS = new Set(['ENCODING', 'CHARSET', 'VALUE', 'LANGUAGE'])

function resolveType(params: Record<string, string>): string | undefined {
  if (params['TYPE']) return params['TYPE']
  const bareFlags = Object.keys(params).filter((k) => !PARAM_META_KEYS.has(k))
  return bareFlags.length ? bareFlags.join(',') : undefined
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
 * Decodes base64 photo data into a data URI.
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

    const encoding = params['ENCODING']?.toUpperCase()
    let decoded = value
    if (encoding === 'QUOTED-PRINTABLE') {
      decoded = decodeQuotedPrintable(value)
      if (params['CHARSET']?.toUpperCase() === 'UTF-8') {
        try {
          const bytes = Uint8Array.from(decoded, c => c.charCodeAt(0))
          decoded = new TextDecoder().decode(bytes)
        } catch { /* keep as-is */ }
      }
    }

    switch (name) {
      case 'FN':
        contact.displayName = unescapeVCard(decoded).trim()
        break

      case 'N': {
        // N:Last;First;Middle;Prefix;Suffix — split on unescaped ';'
        const parts = splitStructured(decoded).map((p) => unescapeVCard(p).trim())
        contact.lastName   = parts[0] || undefined
        contact.firstName  = parts[1] || undefined
        contact.middleName = parts[2] || undefined
        contact.prefix     = parts[3] || undefined
        contact.suffix     = parts[4] || undefined
        break
      }

      case 'UID':
        contact.uid = unescapeVCard(decoded).trim() || uid
        break

      case 'ORG': {
        // ORG: "Company;Department[;...]"
        const orgParts = splitStructured(decoded)
        contact.organization = unescapeVCard(orgParts[0]).trim() || undefined
        if (orgParts[1]) contact.department = unescapeVCard(orgParts[1]).trim() || undefined
        break
      }

      case 'TITLE':
        contact.title = unescapeVCard(decoded).trim() || undefined
        break

      case 'NOTE':
        contact.note = unescapeVCard(decoded).trim() || undefined
        break

      case 'NICKNAME':
        contact.nickname = unescapeVCard(decoded).trim() || undefined
        break

      case 'BDAY':
        contact.birthday = unescapeVCard(decoded).trim() || undefined
        break

      case 'CATEGORIES': {
        const cats = splitOnUnescaped(decoded, ',')
          .map((c) => unescapeVCard(c).trim())
          .filter(Boolean)
        if (cats.length) contact.categories = cats
        break
      }

      case 'URL':
        if (!contact.websites) contact.websites = []
        if (decoded.trim()) contact.websites.push(unescapeVCard(decoded).trim())
        break

      case 'EMAIL': {
        const email: ContactEmail = {
          value: unescapeVCard(decoded).trim(),
          type: resolveType(params)
        }
        if (email.value) contact.emails.push(email)
        break
      }

      case 'TEL': {
        const phone: ContactPhone = {
          value: unescapeVCard(decoded).trim(),
          type: resolveType(params)
        }
        if (phone.value) contact.phones.push(phone)
        break
      }

      case 'ADR': {
        // ADR:POBox;Extended;Street;City;Region;PostalCode;Country
        const parts = splitStructured(decoded).map((p) => unescapeVCard(p).trim())
        const address: ContactAddress = {
          street:     parts[2] || undefined,
          city:       parts[3] || undefined,
          region:     parts[4] || undefined,
          postalCode: parts[5] || undefined,
          country:    parts[6] || undefined,
          type:       resolveType(params) || undefined
        }
        if (Object.entries(address).some(([k, v]) => k !== 'type' && v)) {
          contact.addresses.push(address)
        }
        break
      }

      case 'PHOTO': {
        const valueType = params['VALUE']?.toUpperCase()
        if (encoding === 'B' || encoding === 'BASE64') {
          // Inline base64 — vCard 3.0 standard (ENCODING=b or ENCODING=BASE64)
          const mediaType = (params['TYPE']?.split(/[,;]/)[0] ?? 'jpeg').toLowerCase()
          contact.photoUrl = decodeBase64Photo(decoded, `image/${mediaType}`)
        } else if (decoded.trim().startsWith('data:')) {
          // Inline data URI — vCard 4.0 (DAVx5, modern clients).
          // Radicale bug #1863: incorrectly escapes ';' as '\;' in URI values.
          // unescapeVCard fixes '\;' → ';' so the data URI stays valid.
          contact.photoUrl = unescapeVCard(decoded.trim())
        } else if (valueType === 'URI' || valueType === 'URL' || decoded.startsWith('http')) {
          // External URL — discard to prevent third-party tracking requests
        } else {
          // Fallback: raw base64 without ENCODING param (some clients omit it).
          // Validate: only base64 chars, at least 50 chars to avoid false positives.
          const clean = decoded.replace(/\s/g, '')
          if (clean.length >= 50 && /^[A-Za-z0-9+/]+=*$/.test(clean)) {
            const rawType = params['TYPE']?.split(/[,;]/)[0]
            const mediaType = rawType
              ? rawType.includes('/') ? rawType.toLowerCase() : `image/${rawType.toLowerCase()}`
              : 'image/jpeg'
            contact.photoUrl = `data:${mediaType};base64,${clean}`
          }
        }
        break
      }

      case 'X-CUSTOM1': contact.custom1 = unescapeVCard(decoded).trim() || undefined; break
      case 'X-CUSTOM2': contact.custom2 = unescapeVCard(decoded).trim() || undefined; break
      case 'X-CUSTOM3': contact.custom3 = unescapeVCard(decoded).trim() || undefined; break
      case 'X-CUSTOM4': contact.custom4 = unescapeVCard(decoded).trim() || undefined; break
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
 * Decodes XML character entities in vCard text extracted from a CardDAV response.
 * Radicale serializes CR as &#13; (required by XML spec to prevent line-end
 * normalisation). Without decoding, folded vCard lines are not unfolded correctly
 * and binary fields like PHOTO get &#13; injected into their base64 data.
 */
function decodeXmlEntities(text: string): string {
  return text
    .replace(/&#13;/g, '\r')
    .replace(/&#10;/g, '\n')
    .replace(/&#xD;/gi, '\r')
    .replace(/&#xA;/gi, '\n')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

/**
 * Parses a CardDAV REPORT XML response and returns all contacts.
 * Uses regex to handle namespace prefixes reliably (e.g. <d:response>, <CR:address-data>).
 */
export function parseCardDAVReport(xmlText: string): { href: string; vcardRaw: string }[] {
  const results: { href: string; vcardRaw: string }[] = []

  const responseRegex = /<[^:>]*:?response[^>]*>([\s\S]*?)<\/[^:>]*:?response>/gi
  let responseMatch: RegExpExecArray | null

  while ((responseMatch = responseRegex.exec(xmlText)) !== null) {
    const block = responseMatch[1]

    const hrefMatch = /<[^:>]*:?href[^>]*>([\s\S]*?)<\/[^:>]*:?href>/i.exec(block)
    const href = hrefMatch ? hrefMatch[1].trim() : ''

    const addrMatch = /<[^:>]*:?address-data[^>]*>([\s\S]*?)<\/[^:>]*:?address-data>/i.exec(block)
    const vcardRaw = addrMatch ? decodeXmlEntities(addrMatch[1].trim()) : ''

    if (vcardRaw && vcardRaw.includes('BEGIN:VCARD')) {
      results.push({ href, vcardRaw })
    }
  }

  return results
}

/**
 * Parses a PROPFIND XML response and returns href paths of address books.
 * Uses regex (same approach as parseCardDAVReport) to handle namespace prefixes
 * like <d:response>, <d:href>, <card:addressbook> reliably.
 */
export function parseAddressBookPropfind(xmlText: string): string[] {
  const hrefs: string[] = []

  const responseRegex = /<[^:>]*:?response[^>]*>([\s\S]*?)<\/[^:>]*:?response>/gi
  let responseMatch: RegExpExecArray | null

  while ((responseMatch = responseRegex.exec(xmlText)) !== null) {
    const block = responseMatch[1]

    // Check for addressbook resourcetype (matches <card:addressbook/>, <addressbook/>, etc.)
    if (!/<[^:>]*:?addressbook[\s/>]/i.test(block)) continue

    const hrefMatch = /<[^:>]*:?href[^>]*>([\s\S]*?)<\/[^:>]*:?href>/i.exec(block)
    const href = hrefMatch ? hrefMatch[1].trim() : ''
    if (href) hrefs.push(href)
  }

  return hrefs
}
