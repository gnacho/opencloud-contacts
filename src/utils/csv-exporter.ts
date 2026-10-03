/**
 * Exports contacts as a Thunderbird-compatible CSV file.
 * Column order and headers match the German Thunderbird export format
 * so the file can be re-imported without field mapping issues.
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
]

// Cells starting with these characters are evaluated as formulas by
// spreadsheet apps (CSV injection, e.g. =HYPERLINK(...) or DDE payloads).
const FORMULA_TRIGGER = /^[=+\-@\t\r]/
// Plain numbers such as "+49 30 1234" cannot call functions and must stay
// intact so phone numbers survive a re-import unchanged.
const PLAIN_NUMBER = /^[+-]?[\d\s()./-]+$/

/** Prefix formula-like values with ' so spreadsheets treat them as text. */
export function neutralizeFormula(value: string): string {
  return FORMULA_TRIGGER.test(value) && !PLAIN_NUMBER.test(value) ? `'${value}` : value
}

function csvField(rawValue: string): string {
  const value = neutralizeFormula(rawValue)
  // Quote fields that contain comma, newline or double-quote
  if (value.includes('"') || value.includes(',') || value.includes('\n') || value.includes('\r')) {
    return '"' + value.replace(/"/g, '""') + '"'
  }
  return value
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

function phoneByType(phones: Contact['phones'], ...types: string[]): string {
  const t = types.map((t) => t.toUpperCase())
  return phones.find((p) => p.type && t.some((x) => p.type!.toUpperCase().includes(x)))?.value ?? ''
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

  const telWork   = phoneByType(c.phones, 'WORK')
  const telHome   = phoneByType(c.phones, 'HOME')
  const fax       = phoneByType(c.phones, 'FAX')
  const pager     = phoneByType(c.phones, 'PAGER')
  const mobile    = phoneByType(c.phones, 'CELL', 'MOBILE')

  return [
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
}

export function exportContactsToCSV(contacts: Contact[]): string {
  const rows: string[] = [
    HEADERS.map(csvField).join(','),
    ...contacts.map((c) => contactToRow(c).map(csvField).join(',')),
  ]
  return rows.join('\r\n')
}
