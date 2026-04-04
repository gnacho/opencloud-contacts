import { describe, expect, it } from 'vitest'
import type { Contact } from '../types/contact'
import { contactToVCard } from './vcard-builder'
import { parseVCard } from './vcard-parser'

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    uid: 'contact-1',
    displayName: 'Jane Doe',
    firstName: 'Jane',
    lastName: 'Doe',
    emails: [],
    phones: [],
    addresses: [],
    raw: '',
    ...overrides
  }
}

describe('contactToVCard', () => {
  it('serializes a minimal contact', () => {
    const vcard = contactToVCard(makeContact())

    expect(vcard).toContain('BEGIN:VCARD')
    expect(vcard).toContain('VERSION:3.0')
    expect(vcard).toContain('UID:contact-1')
    expect(vcard).toContain('FN:Jane Doe')
    expect(vcard).toContain('N:Doe;Jane;;;')
    expect(vcard).toContain('END:VCARD')
  })

  it('escapes special characters in text fields', () => {
    const vcard = contactToVCard(
      makeContact({
        displayName: 'Doe, Jane',
        note: 'Line 1\nLine 2',
        organization: 'ACME; Inc',
        nickname: 'Jane\\JD'
      })
    )

    expect(vcard).toContain('FN:Doe\\, Jane')
    expect(vcard).toContain('NOTE:Line 1\\nLine 2')
    expect(vcard).toContain('ORG:ACME\\; Inc')
    expect(vcard).toContain('NICKNAME:Jane\\\\JD')
  })

  it('serializes repeated fields and normalizes birthdays', () => {
    const vcard = contactToVCard(
      makeContact({
        emails: [{ value: 'jane@example.com', type: 'WORK,INTERNET' }],
        phones: [{ value: '+49 123', type: 'CELL' }],
        addresses: [{ street: 'Main St 1', city: 'Berlin', postalCode: '10115', country: 'DE', type: 'HOME' }],
        websites: ['https://example.com'],
        birthday: '1990-04-03'
      })
    )

    expect(vcard).toContain('EMAIL;TYPE=WORK,INTERNET:jane@example.com')
    expect(vcard).toContain('TEL;TYPE=CELL:+49 123')
    expect(vcard).toContain('ADR;TYPE=HOME:;;Main St 1;Berlin;;10115;DE')
    expect(vcard).toContain('URL:https://example.com')
    expect(vcard).toContain('BDAY:19900403')
  })

  it('serializes data-uri photos as inline PHOTO fields', () => {
    const vcard = contactToVCard(
      makeContact({
        photoUrl: 'data:image/png;base64,AAABBBCCC'
      })
    )

    expect(vcard).toContain('PHOTO;ENCODING=b;TYPE=PNG:AAABBBCCC')
  })

  it('folds long lines using RFC continuation syntax', () => {
    const vcard = contactToVCard(
      makeContact({
        note: 'A'.repeat(120)
      })
    )

    expect(vcard).toContain('\r\n ')
    expect(vcard).toContain(`NOTE:${'A'.repeat(70)}`)
  })

  it('serializes department into ORG and custom fields as X-CUSTOMn', () => {
    const vcard = contactToVCard(
      makeContact({
        organization: 'ACME',
        department: 'Engineering',
        custom1: 'foo',
        custom3: 'bar',
      })
    )

    expect(vcard).toContain('ORG:ACME;Engineering')
    expect(vcard).toContain('X-CUSTOM1:foo')
    expect(vcard).toContain('X-CUSTOM3:bar')
    expect(vcard).not.toContain('X-CUSTOM2')
    expect(vcard).not.toContain('X-CUSTOM4')
  })
})

describe('contactToVCard + parseVCard roundtrip', () => {
  it('survives a roundtrip for a complex contact without data loss', () => {
    const original = makeContact({
      firstName: 'Jane',
      lastName: 'Doe',
      displayName: 'Doe, Jane',
      nickname: 'JD',
      organization: 'ACME; Inc',
      department: 'R&D',
      title: 'Engineer',
      emails: [
        { value: 'jane@work.com', type: 'WORK' },
        { value: 'jane@home.com', type: 'HOME' },
      ],
      phones: [
        { value: '+49123', type: 'CELL' },
        { value: '+49456', type: 'WORK' },
      ],
      addresses: [
        { street: 'Main St 1\nApt 2', city: 'Berlin', region: 'BE', postalCode: '10115', country: 'DE', type: 'HOME' },
      ],
      websites: ['https://example.com'],
      birthday: '1990-04-03',
      categories: ['Alle', 'Friends'],
      custom1: 'alpha',
      custom2: 'beta',
      note: 'Line 1\nLine 2',
    })

    const vcard = contactToVCard(original)
    const parsed = parseVCard(vcard, original.uid)

    expect(parsed.displayName).toBe(original.displayName)
    expect(parsed.firstName).toBe(original.firstName)
    expect(parsed.lastName).toBe(original.lastName)
    expect(parsed.nickname).toBe(original.nickname)
    expect(parsed.organization).toBe(original.organization)
    expect(parsed.department).toBe(original.department)
    expect(parsed.title).toBe(original.title)
    expect(parsed.emails).toEqual(original.emails)
    expect(parsed.phones).toEqual(original.phones)
    expect(parsed.addresses[0].city).toBe('Berlin')
    expect(parsed.addresses[0].street).toContain('Main St 1')
    expect(parsed.websites).toEqual(original.websites)
    expect(parsed.birthday).toBe('19900403')
    expect(parsed.categories).toEqual(original.categories)
    expect(parsed.custom1).toBe(original.custom1)
    expect(parsed.custom2).toBe(original.custom2)
    expect(parsed.note).toBe(original.note)
  })
})
