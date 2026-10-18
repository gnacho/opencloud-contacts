/**
 * Exports contacts as a Thunderbird-compatible CSV file.
 * Column order and headers match the German Thunderbird export format
 * so the file can be re-imported without field mapping issues. Two extension
 * columns ("Gruppen", "Weitere Telefonnummern") are appended after the
 * Thunderbird set: Thunderbird ignores them, and this app's importer maps
 * them back, so categories and phone types without a Thunderbird column
 * survive a round-trip. The photo is not exportable to CSV (no column can
 * carry binary data sanely); the vCard remains the lossless format.
 */

import type { Contact } from '../types/contact'

const HEADERS = [
  'Vorname', 'Nachname', 'Anzeigename', 'Spitzname',
  'Primäre E-Mail-Adresse', 'Sekundäre E-Mail-Adresse',
  'Messenger-Name',
  'Tel. dienstlich', 'Tel. privat', 'Fax-Nummer', 'Pager-Nummer', 'Mobil-Tel.-Nr.',
  'Privat: Adresse', 'Privat: Adresse 2', 'Privat: Ort', 'Privat: Bundesland', 'Privat: PLZ', 'Privat: Land',
  'Dienstlich: Adresse', 'Dienstlich: Adresse 2', 'Dienstlich: Ort', 'Dienstlich: Bundesland', 'Dienstlich: PLZ', 'Dienstlich: Land',
  'Arbeitstitel', 'Abteilung', 'Organisation',
  'Webseite 1', 'Webseite 2',
  'Geburtsjahr', 'Geburtsmonat', 'Geburtstag',
  'Benutzerdef. 1', 'Benutzerdef. 2', 'Benutzerdef. 3', 'Benutzerdef. 4',
  'Notizen',
  'Gruppen', 'Weitere Telefonnummern',
]

// Cells starting with these characters are evaluated as formulas by
// spreadsheet apps (CSV injection, e.g. =HYPERLINK(...) or DDE payloads).
const FORMULA_TRIGGER = /^[=+\-@\t\r]/
// Plain numbers such as "+49 30 1234" cannot call functions and must stay
// intact so phone numbers survive a re-import unchanged.
const PLAIN_NUMBER = /^[+-]?[\d\s()./-]+$/

/**
 * Prefix formula-like values with ' so spreadsheets treat them as text.
 * Applied per ';'-separated segment as well: Excel in German and other
 * European locales splits CSV on ';' regardless of our ',' delimiter, so
 * "x;=HYPERLINK(...)" would otherwise land in its own formula cell.
 * The importer strips these apostrophes again (see csv-importer).
 */
export function neutralizeFormula(value: string): string {
  return value
    .split(';')
    .map((seg) => (FORMULA_TRIGGER.test(seg) && !PLAIN_NUMBER.test(seg) ? `'${seg}` : seg))
    .join(';')
}

function csvField(rawValue: string): string {
  const value = neutralizeFormula(rawValue)
  // Quote fields that contain comma, newline or double-quote
  if (value.includes('"') || value.includes(',') || value.includes('\n') || value.includes('\r')) {
    return '"' + value.replace(/"/g, '""') + '"'
  }
  return value
}

// Extension columns carry JSON (categories, extra phones). Always quoted:
// JSON contains '"' and ',', and a ';' inside a category would otherwise
// break re-imports of exports read with ';' as the delimiter.
function csvJsonField(value: unknown): string {
  return '"' + JSON.stringify(value).replace(/"/g, '""') + '"'
}

function parseBirthday(bday?: string): { year: string; month: string; day: string } {
  if (!bday) return { year: '', month: '', day: '' }
  const b = bday.replace(/-/g, '')
  if (b.length === 8) {
    return {
      year:  b.slice(0, 4),
      month: String(parseInt(b.slice(4, 6), 10)),
      day:   String(parseInt(b.slice(6, 8), 10)),
    }
  }
  return { year: '', month: '', day: '' }
}

function phoneByType(phones: Contact['phones'], used: Set<number>, ...types: string[]): string {
  const t = types.map((t) => t.toUpperCase())
  const idx = phones.findIndex(
    (p, i) => !used.has(i) && p.type && t.some((x) => p.type!.toUpperCase().includes(x))
  )
  if (idx === -1) return ''
  used.add(idx)
  return phones[idx].value
}

/** Split a street field into [street1, street2] on newline (as stored by the importer). */
function splitStreet(street?: string): [string, string] {
  if (!street) return ['', '']
  const idx = street.search(/\r?\n/)
  if (idx === -1) return [street, '']
  return [street.slice(0, idx), street.slice(idx).replace(/^\r?\n/, '')]
}

function addrByType(addresses: Contact['addresses'], type: string) {
  const t = type.toUpperCase()
  return addresses.find((a) => a.type?.toUpperCase().split(/[,;]/).map((s) => s.trim()).includes(t))
}

function contactToRow(c: Contact): string[] {
  const home = addrByType(c.addresses, 'HOME') ?? {}
  const work = addrByType(c.addresses, 'WORK') ?? {}
  const bday = parseBirthday(c.birthday)

  const email1 = c.emails[0]?.value ?? ''
  const email2 = c.emails[1]?.value ?? ''

  const usedPhones = new Set<number>()
  const telWork   = phoneByType(c.phones, usedPhones, 'WORK')
  const telHome   = phoneByType(c.phones, usedPhones, 'HOME')
  const fax       = phoneByType(c.phones, usedPhones, 'FAX')
  const pager     = phoneByType(c.phones, usedPhones, 'PAGER')
  const mobile    = phoneByType(c.phones, usedPhones, 'CELL', 'MOBILE')
  // Phones without a Thunderbird column (VOICE, …) ride in the extension
  // column so a round-trip does not drop them.
  const extraPhones = c.phones
    .filter((_, i) => !usedPhones.has(i))
    .map((p) => ({ value: p.value, ...(p.type ? { type: p.type } : {}) }))

  const standardCells = [
    c.firstName ?? '',
    c.lastName ?? '',
    c.displayName,
    c.nickname ?? '',
    email1,
    email2,
    '',                          // Messenger-Name — not stored
    telWork,
    telHome,
    fax,
    pager,
    mobile,
    splitStreet((home as any).street)[0],
    splitStreet((home as any).street)[1],
    (home as any).city ?? '',
    (home as any).region ?? '',
    (home as any).postalCode ?? '',
    (home as any).country ?? '',
    splitStreet((work as any).street)[0],
    splitStreet((work as any).street)[1],
    (work as any).city ?? '',
    (work as any).region ?? '',
    (work as any).postalCode ?? '',
    (work as any).country ?? '',
    c.title ?? '',
    c.department ?? '',
    c.organization ?? '',
    c.websites?.[0] ?? '',
    c.websites?.[1] ?? '',
    bday.year,
    bday.month,
    bday.day,
    c.custom1 ?? '',
    c.custom2 ?? '',
    c.custom3 ?? '',
    c.custom4 ?? '',
    c.note ?? '',
  ]

  // Standard cells go through csvField; the extension cells are pre-formatted
  // JSON (always quoted) and must not be escaped a second time.
  return [
    ...standardCells.map(csvField),
    csvJsonField(c.categories ?? []),
    csvJsonField(extraPhones),
  ]
}

export function exportContactsToCSV(contacts: Contact[]): string {
  const rows: string[] = [
    HEADERS.map(csvField).join(','),
    ...contacts.map((c) => contactToRow(c).join(',')),
  ]
  return rows.join('\r\n')
}
