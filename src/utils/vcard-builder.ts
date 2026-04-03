import type { Contact } from '../types/contact'

function esc(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

export function contactToVCard(contact: Contact): string {
  const lines: string[] = ['BEGIN:VCARD', 'VERSION:4.0', `UID:${contact.uid}`]

  // FN
  lines.push(`FN:${esc(contact.displayName)}`)

  // N: Last;First;Middle;Prefix;Suffix
  lines.push(
    `N:${esc(contact.lastName ?? '')};${esc(contact.firstName ?? '')};${esc(contact.middleName ?? '')};${esc(contact.prefix ?? '')};${esc(contact.suffix ?? '')}`
  )

  // Emails
  for (const email of contact.emails) {
    const type = email.type ? `;TYPE=${email.type}` : ''
    lines.push(`EMAIL${type}:${esc(email.value)}`)
  }

  // Phones
  for (const phone of contact.phones) {
    const type = phone.type ? `;TYPE=${phone.type}` : ''
    lines.push(`TEL${type}:${esc(phone.value)}`)
  }

  // Org / Title
  if (contact.organization) lines.push(`ORG:${esc(contact.organization)}`)
  if (contact.title) lines.push(`TITLE:${esc(contact.title)}`)

  // Nickname
  if (contact.nickname) lines.push(`NICKNAME:${esc(contact.nickname)}`)

  // Addresses
  for (const addr of contact.addresses) {
    const type = addr.type ? `;TYPE=${addr.type}` : ''
    lines.push(
      `ADR${type}:;;${esc(addr.street ?? '')};${esc(addr.city ?? '')};${esc(addr.region ?? '')};${esc(addr.postalCode ?? '')};${esc(addr.country ?? '')}`
    )
  }

  // Birthday
  if (contact.birthday) {
    const bday = contact.birthday.replace(/-/g, '')
    lines.push(`BDAY:${bday}`)
  }

  // Websites
  for (const url of contact.websites ?? []) {
    if (url.trim()) lines.push(`URL:${esc(url.trim())}`)
  }

  // Notes
  if (contact.note) lines.push(`NOTE:${esc(contact.note)}`)

  // Photo (Base64 data URI → inline vCard PHOTO)
  if (contact.photoUrl?.startsWith('data:')) {
    const match = contact.photoUrl.match(/^data:image\/(\w+);base64,(.+)$/)
    if (match) {
      const mediaType = match[1].toUpperCase()
      const b64 = match[2]
      lines.push(`PHOTO;ENCODING=b;TYPE=${mediaType}:${b64}`)
    }
  }

  lines.push('END:VCARD')
  return lines.join('\r\n')
}
