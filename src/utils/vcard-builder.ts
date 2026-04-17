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

  if (contact.organization || contact.department) {
    const orgValue = contact.department
      ? `${esc(contact.organization ?? '')};${esc(contact.department)}`
      : esc(contact.organization ?? '')
    push(`ORG:${orgValue}`)
  }
  if (contact.title)    push(`TITLE:${esc(contact.title)}`)
  if (contact.nickname) push(`NICKNAME:${esc(contact.nickname)}`)

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

  if (contact.custom1) push(`X-CUSTOM1:${esc(contact.custom1)}`)
  if (contact.custom2) push(`X-CUSTOM2:${esc(contact.custom2)}`)
  if (contact.custom3) push(`X-CUSTOM3:${esc(contact.custom3)}`)
  if (contact.custom4) push(`X-CUSTOM4:${esc(contact.custom4)}`)

  if (contact.note) push(`NOTE:${esc(contact.note)}`)

  // Photo: vCard 3.0 inline base64 (ENCODING=b), intentionally NOT folded.
  // Radicale/vobject corrupts folded base64: it doesn't unfold CRLF+SP continuation
  // lines before base64-decoding, so chunk boundaries corrupt the binary data.
  // DAVx5 also sends PHOTO unfolded — matching that behaviour avoids the bug.
  // vCard 4.0 data URIs are not used because vobject splits on ',' and drops the payload.
  if (contact.photoUrl?.match(/^data:image\/(\w+);base64,/)) {
    const mimeMatch = contact.photoUrl.match(/^data:image\/(\w+);base64,(.+)$/)
    if (mimeMatch) {
      const mediaType = mimeMatch[1].toUpperCase()
      const base64Data = mimeMatch[2]
      out.push(`PHOTO;ENCODING=b;TYPE=${mediaType}:${base64Data}`)
    }
  }

  out.push('END:VCARD')
  return out.join('\r\n')
}
