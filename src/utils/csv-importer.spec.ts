import { describe, it, expect } from 'vitest'
import { parseThunderbirdCSV, csvContactToVCard } from './csv-importer'

describe('parseThunderbirdCSV', () => {
  it('parses comma-separated Thunderbird CSV', () => {
    const csv = [
      'First Name,Last Name,Display Name,Primary Email',
      'John,Doe,John Doe,john@example.com',
    ].join('\r\n')
    const contacts = parseThunderbirdCSV(csv)
    expect(contacts).toHaveLength(1)
    expect(contacts[0].firstName).toBe('John')
    expect(contacts[0].email1).toBe('john@example.com')
  })

  it('parses semicolon-separated CSV (German Thunderbird locale)', () => {
    const csv = [
      'Vorname;Nachname;Anzeigename;Primäre E-Mail-Adresse',
      'Hans;Müller;Hans Müller;hans@example.de',
    ].join('\r\n')
    const contacts = parseThunderbirdCSV(csv)
    expect(contacts).toHaveLength(1)
    expect(contacts[0].firstName).toBe('Hans')
    expect(contacts[0].email1).toBe('hans@example.de')
  })

  it('skips rows with no identifying data', () => {
    const csv = [
      'First Name,Last Name,Primary Email',
      ',,',
      'Jane,Doe,jane@example.com',
    ].join('\r\n')
    const contacts = parseThunderbirdCSV(csv)
    expect(contacts).toHaveLength(1)
    expect(contacts[0].firstName).toBe('Jane')
  })
})

describe('csvContactToVCard', () => {
  it('serializes pager number as TEL;TYPE=PAGER', () => {
    const { vcard } = csvContactToVCard({ ...emptyContact(), firstName: 'A', pager: '0123' })
    expect(vcard).toContain('TEL;TYPE=PAGER:0123')
  })

  it('serializes department into ORG field', () => {
    const { vcard } = csvContactToVCard({ ...emptyContact(), firstName: 'A', organization: 'ACME', department: 'IT' })
    expect(vcard).toContain('ORG:ACME;IT')
  })

  it('serializes custom fields as X-CUSTOMn', () => {
    const { vcard } = csvContactToVCard({ ...emptyContact(), firstName: 'A', custom1: 'foo', custom3: 'bar' })
    expect(vcard).toContain('X-CUSTOM1:foo')
    expect(vcard).toContain('X-CUSTOM3:bar')
  })
})

function emptyContact() {
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
