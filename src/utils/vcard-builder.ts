import type { Contact } from '../types/contact'

function esc(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
}

/**
 * Fold long vCard lines at 75 *octets* (RFC 6350 §3.2).
 * Uses TextEncoder so multi-byte UTF-8 characters are counted correctly.
 */
function foldLine(line: string): string {
  const encoder = new TextEncoder()
  if (encoder.encode(line).length <= 75) return line

  const parts: string[] = []
  let start = 0
  let isFirst = true

  while (start < line.length) {
    const limit = isFirst ? 75 : 74 // continuation lines have a leading space byte
    let end = start
    let bytes = 0

    while (end < line.length) {
      const cp = line.codePointAt(end)!
      const step = cp > 0xffff ? 2 : 1
      const charBytes = encoder.encode(line.slice(end, end + step)).length
      if (bytes + charBytes > limit) break
      bytes += charBytes
      end += step
    }

    if (end === start) end = start + 1 // safety: single char wider than limit
    parts.push(line.slice(start, end))
    start = end
    isFirst = false
  }

  return parts.join('\r\n ')
}

export function contactToVCard(contact: Contact): string {
  const out: string[] = ['BEGIN:VCARD', 'VERSION:3.0', `UID:${contact.uid}`]
  const push = (line: string) => out.push(foldLine(line))

  push(`FN:${esc(contact.displayName)}`)

  push(
    `N:${esc(contact.lastName ?? '')};${esc(contact.firstName ?? '')};${esc(contact.middleName ?? '')};${esc(contact.prefix ?? '')};${esc(contact.suffix ?? '')}`
  )

  for (const email of contact.emails) {
    const type = email.type ? `;TYPE=${email.type}` : ''
    push(`EMAIL${type}:${esc(email.value)}`)
  }

  for (const phone of contact.phones) {
    const type = phone.type ? `;TYPE=${phone.type}` : ''
    push(`TEL${type}:${esc(phone.value)}`)
  }

  if (contact.organization) push(`ORG:${esc(contact.organization)}`)
  if (contact.title)        push(`TITLE:${esc(contact.title)}`)
  if (contact.nickname)     push(`NICKNAME:${esc(contact.nickname)}`)

  for (const addr of contact.addresses) {
    const type = addr.type ? `;TYPE=${addr.type}` : ''
    push(
      `ADR${type}:;;${esc(addr.street ?? '')};${esc(addr.city ?? '')};${esc(addr.region ?? '')};${esc(addr.postalCode ?? '')};${esc(addr.country ?? '')}`
    )
  }

  if (contact.birthday) {
    push(`BDAY:${contact.birthday.replace(/-/g, '')}`)
  }

  for (const url of contact.websites ?? []) {
    if (url.trim()) push(`URL:${esc(url.trim())}`)
  }

  if (contact.categories?.length) {
    push(`CATEGORIES:${contact.categories.map(esc).join(',')}`)
  }

  if (contact.note) push(`NOTE:${esc(contact.note)}`)

  // Photo: inline Base64 or external URI
  if (contact.photoUrl?.startsWith('data:')) {
    const match = contact.photoUrl.match(/^data:image\/(\w+);base64,(.+)$/)
    if (match) {
      push(`PHOTO;ENCODING=BASE64;TYPE=${match[1].toUpperCase()}:${match[2]}`)
    }
  } else if (contact.photoUrl?.startsWith('http')) {
    push(`PHOTO;VALUE=URI:${contact.photoUrl}`)
  }

  out.push('END:VCARD')
  return out.join('\r\n')
}
