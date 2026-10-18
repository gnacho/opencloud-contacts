import { newUid } from './uid'

/**
 * Thunderbird CSV import (German + English column headers)
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
  /** Extension column "Gruppen"/"Categories": JSON array of category names */
  categories?: string[]
  /** Extension column "Weitere Telefonnummern"/"Other Phones": JSON array of
   * phones whose type has no Thunderbird column (VOICE, …) */
  extraPhones?: { value: string; type?: string }[]
}

// Computed once — avoids recreating keys on every imported row. Only the
// plain string fields: categories/extraPhones are parsed separately from the
// JSON extension columns.
const CONTACT_KEYS = [
  'firstName', 'lastName', 'displayName', 'nickname',
  'email1', 'email2',
  'telWork', 'telHome', 'fax', 'pager', 'mobile',
  'homeStreet', 'homeStreet2', 'homeCity', 'homeState', 'homeZip', 'homeCountry',
  'workStreet', 'workStreet2', 'workCity', 'workState', 'workZip', 'workCountry',
  'title', 'department', 'organization',
  'website1', 'website2',
  'birthYear', 'birthMonth', 'birthDay',
  'custom1', 'custom2', 'custom3', 'custom4',
  'notes',
] satisfies readonly (keyof CsvContact)[]

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
  // Own extension columns (appended after the Thunderbird set; Thunderbird
  // ignores them, this importer maps them back)
  'Gruppen': 'categories',
  'Categories': 'categories',
  'Weitere Telefonnummern': 'extraPhones',
  'Other Phones': 'extraPhones',
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

/** Strip UTF-8 BOM and surrounding whitespace from a header cell */
function normalizeHeader(s: string): string {
  return s.replace(/^\uFEFF/, '').trim()
}

/**
 * Detect whether a CSV header line uses ',' or ';' as separator.
 * Thunderbird on German locales exports with ';'.
 */
function detectSeparator(headerLine: string): ',' | ';' {
  const commas = (headerLine.match(/,/g) ?? []).length
  const semis = (headerLine.match(/;/g) ?? []).length
  return semis > commas ? ';' : ','
}

/** RFC 4180 compliant CSV parser — handles quoted multiline fields */
function parseCSV(text: string, separator: ',' | ';'): string[][] {
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
      } else if (ch === separator) {
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

  if (inQuotes) throw new Error('Malformed CSV: unclosed quote')

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
  // Detect separator from first non-empty line (before full parse)
  const firstLine = csvText.slice(0, csvText.search(/\r?\n/))
  const separator = detectSeparator(firstLine)
  const records = parseCSV(csvText, separator)
  if (records.length < 2) return []

  // Build header → column index map; strip BOM from first cell
  const header = records[0].map((h, i) => i === 0 ? normalizeHeader(h) : h.trim())
  const fieldIndex = new Map<keyof CsvContact, number>()
  for (let i = 0; i < header.length; i++) {
    const key = COLUMN_MAP[header[i]]
    if (key) fieldIndex.set(key, i)
  }

  // Strip the ' prefix our CSV export adds to formula-like values, both at the
  // start of a field and after ';'. The trigger set must match FORMULA_TRIGGER
  // in csv-exporter (= + - @ tab CR) or a tab-led value round-trips with a
  // stray apostrophe.
  const get = (cols: string[], key: keyof CsvContact): string =>
    (cols[fieldIndex.get(key) ?? -1] ?? '').trim().replace(/(^|;)'(?=[=+\-@\t\r])/g, '$1')

  const parseJsonCell = <T>(cell: string | undefined): T | undefined => {
    if (!cell) return undefined
    try {
      return JSON.parse(cell) as T
    } catch {
      return undefined
    }
  }

  const contacts: CsvContact[] = []
  for (let i = 1; i < records.length; i++) {
    const cols = records[i]
    const c = emptyContact()
    for (const key of CONTACT_KEYS) {
      c[key] = get(cols, key)
    }
    const categories = parseJsonCell<unknown>(cols[fieldIndex.get('categories') ?? -1])
    if (Array.isArray(categories)) {
      c.categories = categories.filter((x): x is string => typeof x === 'string')
    }
    const extraPhones = parseJsonCell<unknown>(cols[fieldIndex.get('extraPhones') ?? -1])
    if (Array.isArray(extraPhones)) {
      c.extraPhones = extraPhones
        .filter((p): p is { value: string; type?: unknown } => typeof p === 'object' && p !== null && typeof (p as { value?: unknown }).value === 'string')
        .map((p) => ({
          value: p.value,
          ...(typeof p.type === 'string' ? { type: p.type } : {})
        }))
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

export function csvContactToVCard(c: CsvContact, defaultCategory?: string): { uid: string; vcard: string } {
  const uid = newUid()
  const out: string[] = ['BEGIN:VCARD', 'VERSION:3.0', `UID:${uid}`]
  const push = (line: string) => out.push(foldLine(line))

  const fn =
    c.displayName ||
    [c.firstName, c.lastName].filter(Boolean).join(' ') ||
    c.organization || c.email1 || 'Unknown'
  push(`FN:${escapeVCard(fn)}`)
  push(`N:${escapeVCard(c.lastName)};${escapeVCard(c.firstName)};;;`)

  if (c.nickname) push(`NICKNAME:${escapeVCard(c.nickname)}`)

  if (c.email1) push(`EMAIL;TYPE=INTERNET:${escapeVCard(c.email1)}`)
  if (c.email2) push(`EMAIL;TYPE=INTERNET:${escapeVCard(c.email2)}`)

  if (c.mobile)  push(`TEL;TYPE=CELL:${escapeVCard(c.mobile)}`)
  if (c.telWork) push(`TEL;TYPE=WORK:${escapeVCard(c.telWork)}`)
  if (c.telHome) push(`TEL;TYPE=HOME:${escapeVCard(c.telHome)}`)
  if (c.fax)     push(`TEL;TYPE=FAX:${escapeVCard(c.fax)}`)
  if (c.pager)   push(`TEL;TYPE=PAGER:${escapeVCard(c.pager)}`)

  // Phones of types without a Thunderbird column (VOICE, …), carried in the
  // "Weitere Telefonnummern" extension column. The type is sanitised like the
  // vCard builder does, so a crafted value cannot inject a property line.
  for (const p of c.extraPhones ?? []) {
    if (!p.value) continue
    const type = p.type?.replace(/[^A-Za-z0-9,_-]/g, '') ?? ''
    push(`TEL${type ? `;TYPE=${type}` : ''}:${escapeVCard(p.value)}`)
  }

  if (c.organization || c.department) {
    push(`ORG:${escapeVCard(c.organization)};${escapeVCard(c.department)}`)
  }
  if (c.title) push(`TITLE:${escapeVCard(c.title)}`)

  if (c.homeStreet || c.homeStreet2 || c.homeCity || c.homeState || c.homeZip || c.homeCountry) {
    const street = escapeVCard([c.homeStreet, c.homeStreet2].filter(Boolean).join('\n'))
    push(`ADR;TYPE=HOME:;;${street};${escapeVCard(c.homeCity)};${escapeVCard(c.homeState)};${escapeVCard(c.homeZip)};${escapeVCard(c.homeCountry)}`)
  }

  if (c.workStreet || c.workStreet2 || c.workCity || c.workState || c.workZip || c.workCountry) {
    const street = escapeVCard([c.workStreet, c.workStreet2].filter(Boolean).join('\n'))
    push(`ADR;TYPE=WORK:;;${street};${escapeVCard(c.workCity)};${escapeVCard(c.workState)};${escapeVCard(c.workZip)};${escapeVCard(c.workCountry)}`)
  }

  if (/^\d{4}$/.test(c.birthYear) && c.birthMonth && c.birthDay) {
    const m = Number(c.birthMonth)
    const d = Number(c.birthDay)
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      push(`BDAY:${c.birthYear}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}`)
    }
  }

  if (c.website1) push(`URL:${escapeVCard(c.website1)}`)
  if (c.website2) push(`URL:${escapeVCard(c.website2)}`)

  if (c.custom1) push(`X-CUSTOM1:${escapeVCard(c.custom1)}`)
  if (c.custom2) push(`X-CUSTOM2:${escapeVCard(c.custom2)}`)
  if (c.custom3) push(`X-CUSTOM3:${escapeVCard(c.custom3)}`)
  if (c.custom4) push(`X-CUSTOM4:${escapeVCard(c.custom4)}`)

  // Categories carried in the "Gruppen" extension column win over the import
  // default category; the default applies only when the row has none.
  const categories = c.categories?.length ? c.categories : defaultCategory ? [defaultCategory] : []
  if (categories.length) push(`CATEGORIES:${categories.map(escapeVCard).join(',')}`)

  if (c.notes) push(`NOTE:${escapeVCard(c.notes)}`)

  out.push('END:VCARD')
  return { uid, vcard: out.join('\r\n') }
}
