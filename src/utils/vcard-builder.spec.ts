import { describe, expect, it } from 'vitest'
import type { Contact } from '../types/contact'
import { contactToVCard } from './vcard-builder'

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

    expect(vcard).toContain('PHOTO;ENCODING=BASE64;TYPE=PNG:AAABBBCCC')
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
})
