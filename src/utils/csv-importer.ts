/**
 * Thunderbird CSV import (German + English column headers)
 *
 * Fixes vs. previous version:
 * - RFC 4180 compliant multiline-safe CSV parser (character-by-character)
 * - Header-based column mapping (immune to column order changes / language)
 * - crypto.randomUUID() instead of Math.random()
 * - RFC 6350 line folding for all vCard properties
 * - VERSION:3.0 (consistent with vcard-builder.ts)
 * - ADR street2 joined with \n per spec (not space)
 * - escapeVCard handles \r\n and \r
 * - Birthday validation (month 1–12, day 1–31)
 */

export interface CsvContact {
  firstName: string
  lastName: string
  displayName: string
  nickname: string
  email1: string
  email2: string
  telWork: string
  telHome: string
  fax: string
  pager: string
  mobile: string
  homeStreet: string
  homeStreet2: string
  homeCity: string
  homeState: string
  homeZip: string
  homeCountry: string
  workStreet: string
  workStreet2: string
  workCity: string
  workState: string
  workZip: string
  workCountry: string
  title: string
  department: string
  organization: string
  website1: string
  website2: string
  birthYear: string
  birthMonth: string
  birthDay: string
  custom1: string
  custom2: string
  custom3: string
  custom4: string
  notes: string
}

// German and English Thunderbird column name → CsvContact field
const COLUMN_MAP: Record<string, keyof CsvContact> = {
  // German
  'Vorname': 'firstName',
  'Nachname': 'lastName',
  'Anzeigename': 'displayName',
  'Spitzname': 'nickname',
  'Primäre E-Mail-Adresse': 'email1',
  'Sekundäre E-Mail-Adresse': 'email2',
  'Tel. dienstlich': 'telWork',
  'Tel. privat': 'telHome',
  'Fax-Nummer': 'fax',
  'Pager-Nummer': 'pager',
  'Mobil-Tel.-Nr.': 'mobile',
  'Privat: Adresse': 'homeStreet',
  'Privat: Adresse 2': 'homeStreet2',
  'Privat: Ort': 'homeCity',
  'Privat: Bundesland': 'homeState',
  'Privat: PLZ': 'homeZip',
  'Privat: Land': 'homeCountry',
  'Dienstlich: Adresse': 'workStreet',
  'Dienstlich: Adresse 2': 'workStreet2',
  'Dienstlich: Ort': 'workCity',
  'Dienstlich: Bundesland': 'workState',
  'Dienstlich: PLZ': 'workZip',
  'Dienstlich: Land': 'workCountry',
  'Arbeitstitel': 'title',
  'Abteilung': 'department',
  'Organisation': 'organization',
  'Webseite 1': 'website1',
  'Webseite 2': 'website2',
  'Geburtsjahr': 'birthYear',
  'Geburtsmonat': 'birthMonth',
  'Geburtstag': 'birthDay',
  'Benutzerdef. 1': 'custom1',
  'Benutzerdef. 2': 'custom2',
  'Benutzerdef. 3': 'custom3',
  'Benutzerdef. 4': 'custom4',
  'Notizen': 'notes',
  // English
  'First Name': 'firstName',
  'Last Name': 'lastName',
  'Display Name': 'displayName',
  'Nickname': 'nickname',
  'Primary Email': 'email1',
  'Secondary Email': 'email2',
  'Work Phone': 'telWork',
  'Home Phone': 'telHome',
  'Fax Number': 'fax',
  'Pager Number': 'pager',
  'Mobile Number': 'mobile',
  'Home Address': 'homeStreet',
  'Home Address 2': 'homeStreet2',
  'Home City': 'homeCity',
  'Home State': 'homeState',
  'Home ZipCode': 'homeZip',
  'Home Country': 'homeCountry',
  'Work Address': 'workStreet',
  'Work Address 2': 'workStreet2',
  'Work City': 'workCity',
  'Work State': 'workState',
  'Work ZipCode': 'workZip',
  'Work Country': 'workCountry',
  'Job Title': 'title',
  'Department': 'department',
  'Organization': 'organization',
  'Web Page 1': 'website1',
  'Web Page 2': 'website2',
  'Birth Year': 'birthYear',
  'Birth Month': 'birthMonth',
  'Birth Day': 'birthDay',
  'Custom 1': 'custom1',
  'Custom 2': 'custom2',
  'Custom 3': 'custom3',
  'Custom 4': 'custom4',
  'Notes': 'notes',
}

/** RFC 4180 compliant CSV parser — handles quoted multiline fields */
function parseCSV(text: string): string[][] {
  const records: string[][] = []
  let fields: string[] = []
  let current = ''
  let inQuotes = false
  let i = 0

  while (i < text.length) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        current += '"'
        i += 2
        continue
      } else if (ch === '"') {
        inQuotes = false
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        fields.push(current)
        current = ''
      } else if (ch === '\r' && text[i + 1] === '\n') {
        fields.push(current)
        records.push(fields)
        fields = []
        current = ''
        i += 2
        continue
      } else if (ch === '\n') {
        fields.push(current)
        records.push(fields)
        fields = []
        current = ''
      } else {
        current += ch
      }
    }
    i++
  }
  // Last field / record
  fields.push(current)
  if (fields.some((f) => f.trim())) records.push(fields)

  return records
}

function emptyContact(): CsvContact {
  return {
    firstName: '', lastName: '', displayName: '', nickname: '',
    email1: '', email2: '',
    telWork: '', telHome: '', fax: '', pager: '', mobile: '',
    homeStreet: '', homeStreet2: '', homeCity: '', homeState: '', homeZip: '', homeCountry: '',
    workStreet: '', workStreet2: '', workCity: '', workState: '', workZip: '', workCountry: '',
    title: '', department: '', organization: '',
    website1: '', website2: '',
    birthYear: '', birthMonth: '', birthDay: '',
    custom1: '', custom2: '', custom3: '', custom4: '',
    notes: '',
  }
}

export function parseThunderbirdCSV(csvText: string): CsvContact[] {
  const records = parseCSV(csvText)
  if (records.length < 2) return []

  // Map header names → column indices
  const header = records[0].map((h) => h.trim())
  const fieldIndex = new Map<keyof CsvContact, number>()
  for (let i = 0; i < header.length; i++) {
    const key = COLUMN_MAP[header[i]]
    if (key) fieldIndex.set(key, i)
  }

  const get = (cols: string[], key: keyof CsvContact): string =>
    (cols[fieldIndex.get(key) ?? -1] ?? '').trim()

  const contacts: CsvContact[] = []
  for (let i = 1; i < records.length; i++) {
    const cols = records[i]
    const c = emptyContact()
    for (const key of Object.keys(c) as (keyof CsvContact)[]) {
      c[key] = get(cols, key)
    }
    if (!c.email1 && !c.firstName && !c.lastName && !c.displayName && !c.organization) continue
    contacts.push(c)
  }
  return contacts
}

function escapeVCard(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n/g, '\\n')
    .replace(/\r/g, '\\n')
    .replace(/\n/g, '\\n')
}

/** Fold long vCard lines at 75 octets (RFC 6350 §3.2) */
function foldLine(line: string): string {
  if (line.length <= 75) return line
  let result = line.slice(0, 75)
  let pos = 75
  while (pos < line.length) {
    result += '\r\n ' + line.slice(pos, pos + 74)
    pos += 74
  }
  return result
}

export function csvContactToVCard(c: CsvContact): { uid: string; vcard: string } {
  const uid = crypto.randomUUID()
  const out: string[] = ['BEGIN:VCARD', 'VERSION:3.0', `UID:${uid}`]
  const push = (line: string) => out.push(foldLine(line))

  // FN
  const fn =
    c.displayName ||
    [c.firstName, c.lastName].filter(Boolean).join(' ') ||
    c.organization || c.email1 || 'Unknown'
  push(`FN:${escapeVCard(fn)}`)

  // N
  push(`N:${escapeVCard(c.lastName)};${escapeVCard(c.firstName)};;;`)

  if (c.nickname) push(`NICKNAME:${escapeVCard(c.nickname)}`)

  // Emails
  if (c.email1) push(`EMAIL;TYPE=INTERNET:${escapeVCard(c.email1)}`)
  if (c.email2) push(`EMAIL;TYPE=INTERNET:${escapeVCard(c.email2)}`)

  // Phones
  if (c.mobile)  push(`TEL;TYPE=CELL:${escapeVCard(c.mobile)}`)
  if (c.telWork) push(`TEL;TYPE=WORK:${escapeVCard(c.telWork)}`)
  if (c.telHome) push(`TEL;TYPE=HOME:${escapeVCard(c.telHome)}`)
  if (c.fax)     push(`TEL;TYPE=FAX:${escapeVCard(c.fax)}`)

  // Organisation
  if (c.organization) push(`ORG:${escapeVCard(c.organization)}`)
  if (c.title)        push(`TITLE:${escapeVCard(c.title)}`)

  // Home address — street lines joined with \n per ADR spec
  if (c.homeStreet || c.homeCity || c.homeZip || c.homeCountry) {
    const street = escapeVCard([c.homeStreet, c.homeStreet2].filter(Boolean).join('\n'))
    push(`ADR;TYPE=HOME:;;${street};${escapeVCard(c.homeCity)};${escapeVCard(c.homeState)};${escapeVCard(c.homeZip)};${escapeVCard(c.homeCountry)}`)
  }

  // Work address
  if (c.workStreet || c.workCity || c.workZip || c.workCountry) {
    const street = escapeVCard([c.workStreet, c.workStreet2].filter(Boolean).join('\n'))
    push(`ADR;TYPE=WORK:;;${street};${escapeVCard(c.workCity)};${escapeVCard(c.workState)};${escapeVCard(c.workZip)};${escapeVCard(c.workCountry)}`)
  }

  // Birthday with basic validation
  if (c.birthYear && c.birthMonth && c.birthDay) {
    const m = Number(c.birthMonth)
    const d = Number(c.birthDay)
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      push(`BDAY:${c.birthYear}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}`)
    }
  }

  // URLs
  if (c.website1) push(`URL:${escapeVCard(c.website1)}`)
  if (c.website2) push(`URL:${escapeVCard(c.website2)}`)

  // Notes
  if (c.notes) push(`NOTE:${escapeVCard(c.notes)}`)

  out.push('END:VCARD')
  return { uid, vcard: out.join('\r\n') }
}
