/**
 * Thunderbird CSV import:
 * Vorname,Nachname,Anzeigename,Spitzname,Primäre E-Mail-Adresse,Sekundäre E-Mail-Adresse,
 * Messenger-Name,Tel. dienstlich,Tel. privat,Fax-Nummer,Pager-Nummer,Mobil-Tel.-Nr.,
 * Privat: Adresse,Privat: Adresse 2,Privat: Ort,Privat: Bundesland,Privat: PLZ,Privat: Land,
 * Dienstlich: Adresse,Dienstlich: Adresse 2,Dienstlich: Ort,Dienstlich: Bundesland,Dienstlich: PLZ,Dienstlich: Land,
 * Arbeitstitel,Abteilung,Organisation,Webseite 1,Webseite 2,
 * Geburtsjahr,Geburtsmonat,Geburtstag,
 * Benutzerdef. 1,Benutzerdef. 2,Benutzerdef. 3,Benutzerdef. 4,Notizen
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

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

export function parseThunderbirdCSV(csvText: string): CsvContact[] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []

  // Skip header line
  const contacts: CsvContact[] = []

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i])
    if (cols.length < 5) continue

    const c: CsvContact = {
      firstName:   cols[0]?.trim() ?? '',
      lastName:    cols[1]?.trim() ?? '',
      displayName: cols[2]?.trim() ?? '',
      nickname:    cols[3]?.trim() ?? '',
      email1:      cols[4]?.trim() ?? '',
      email2:      cols[5]?.trim() ?? '',
      telWork:     cols[7]?.trim() ?? '',
      telHome:     cols[8]?.trim() ?? '',
      fax:         cols[9]?.trim() ?? '',
      pager:       cols[10]?.trim() ?? '',
      mobile:      cols[11]?.trim() ?? '',
      homeStreet:  cols[12]?.trim() ?? '',
      homeStreet2: cols[13]?.trim() ?? '',
      homeCity:    cols[14]?.trim() ?? '',
      homeState:   cols[15]?.trim() ?? '',
      homeZip:     cols[16]?.trim() ?? '',
      homeCountry: cols[17]?.trim() ?? '',
      workStreet:  cols[18]?.trim() ?? '',
      workStreet2: cols[19]?.trim() ?? '',
      workCity:    cols[20]?.trim() ?? '',
      workState:   cols[21]?.trim() ?? '',
      workZip:     cols[22]?.trim() ?? '',
      workCountry: cols[23]?.trim() ?? '',
      title:       cols[24]?.trim() ?? '',
      department:  cols[25]?.trim() ?? '',
      organization:cols[26]?.trim() ?? '',
      website1:    cols[27]?.trim() ?? '',
      website2:    cols[28]?.trim() ?? '',
      birthYear:   cols[29]?.trim() ?? '',
      birthMonth:  cols[30]?.trim() ?? '',
      birthDay:    cols[31]?.trim() ?? '',
      custom1:     cols[32]?.trim() ?? '',
      custom2:     cols[33]?.trim() ?? '',
      custom3:     cols[34]?.trim() ?? '',
      custom4:     cols[35]?.trim() ?? '',
      notes:       cols[36]?.trim() ?? '',
    }

    // Skip completely empty rows
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
    .replace(/\n/g, '\\n')
}

function generateUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

export function csvContactToVCard(c: CsvContact): { uid: string; vcard: string } {
  const uid = generateUID()
  const lines: string[] = ['BEGIN:VCARD', 'VERSION:4.0', `UID:${uid}`]

  // FN (display name)
  const fn = c.displayName ||
    [c.firstName, c.lastName].filter(Boolean).join(' ') ||
    c.organization ||
    c.email1 ||
    'Unknown'
  lines.push(`FN:${escapeVCard(fn)}`)

  // N
  const lastName  = escapeVCard(c.lastName)
  const firstName = escapeVCard(c.firstName)
  lines.push(`N:${lastName};${firstName};;;`)

  // Emails
  if (c.email1) lines.push(`EMAIL;TYPE=INTERNET:${escapeVCard(c.email1)}`)
  if (c.email2) lines.push(`EMAIL;TYPE=INTERNET:${escapeVCard(c.email2)}`)

  // Phones
  if (c.mobile)  lines.push(`TEL;TYPE=CELL:${escapeVCard(c.mobile)}`)
  if (c.telWork) lines.push(`TEL;TYPE=WORK:${escapeVCard(c.telWork)}`)
  if (c.telHome) lines.push(`TEL;TYPE=HOME:${escapeVCard(c.telHome)}`)
  if (c.fax)     lines.push(`TEL;TYPE=FAX:${escapeVCard(c.fax)}`)

  // Organisation
  if (c.organization) lines.push(`ORG:${escapeVCard(c.organization)}`)
  if (c.title)        lines.push(`TITLE:${escapeVCard(c.title)}`)

  // Home address
  if (c.homeStreet || c.homeCity || c.homeZip || c.homeCountry) {
    const street = escapeVCard([c.homeStreet, c.homeStreet2].filter(Boolean).join(' '))
    lines.push(`ADR;TYPE=HOME:;;${street};${escapeVCard(c.homeCity)};${escapeVCard(c.homeState)};${escapeVCard(c.homeZip)};${escapeVCard(c.homeCountry)}`)
  }

  // Work address
  if (c.workStreet || c.workCity || c.workZip || c.workCountry) {
    const street = escapeVCard([c.workStreet, c.workStreet2].filter(Boolean).join(' '))
    lines.push(`ADR;TYPE=WORK:;;${street};${escapeVCard(c.workCity)};${escapeVCard(c.workState)};${escapeVCard(c.workZip)};${escapeVCard(c.workCountry)}`)
  }

  // Birthday
  if (c.birthYear && c.birthMonth && c.birthDay) {
    const m = c.birthMonth.padStart(2, '0')
    const d = c.birthDay.padStart(2, '0')
    lines.push(`BDAY:${c.birthYear}${m}${d}`)
  }

  // URLs
  if (c.website1) lines.push(`URL:${escapeVCard(c.website1)}`)
  if (c.website2) lines.push(`URL:${escapeVCard(c.website2)}`)

  // Notes
  if (c.notes) lines.push(`NOTE:${escapeVCard(c.notes)}`)

  // Nickname
  if (c.nickname) lines.push(`NICKNAME:${escapeVCard(c.nickname)}`)

  lines.push('END:VCARD')
  return { uid, vcard: lines.join('\r\n') }
}
