import { describe, expect, it } from 'vitest'
import { parseAddressBookPropfind, parseCardDAVReport, parseVCard } from './vcard-parser'

describe('parseVCard', () => {
  it('parses a minimal contact', () => {
    const contact = parseVCard(
      ['BEGIN:VCARD', 'VERSION:3.0', 'UID:abc-123', 'FN:Jane Doe', 'N:Doe;Jane;;;', 'EMAIL:jane@example.com', 'END:VCARD'].join('\r\n'),
      'fallback-id'
    )

    expect(contact.uid).toBe('abc-123')
    expect(contact.displayName).toBe('Jane Doe')
    expect(contact.firstName).toBe('Jane')
    expect(contact.lastName).toBe('Doe')
    expect(contact.emails).toEqual([{ value: 'jane@example.com', type: undefined }])
  })

  it('falls back to a generated display name when FN is missing', () => {
    const contact = parseVCard(
      ['BEGIN:VCARD', 'VERSION:3.0', 'N:Doe;Jane;;;', 'END:VCARD'].join('\r\n'),
      'fallback-id'
    )

    expect(contact.displayName).toBe('Jane Doe')
  })

  it('parses typed email, phone, address, website and birthday fields', () => {
    const contact = parseVCard(
      [
        'BEGIN:VCARD',
        'VERSION:3.0',
        'FN:Jane Doe',
        'EMAIL;TYPE=WORK,INTERNET:jane@example.com',
        'TEL;TYPE=CELL:+49 123',
        'ADR;TYPE=HOME:;;Main St 1;Berlin;BE;10115;DE',
        'URL:https://example.com',
        'BDAY:19900403',
        'END:VCARD'
      ].join('\r\n'),
      'fallback-id'
    )

    expect(contact.emails).toEqual([{ value: 'jane@example.com', type: 'WORK,INTERNET' }])
    expect(contact.phones).toEqual([{ value: '+49 123', type: 'CELL' }])
    expect(contact.addresses).toEqual([
      {
        street: 'Main St 1',
        city: 'Berlin',
        region: 'BE',
        postalCode: '10115',
        country: 'DE',
        type: 'HOME'
      }
    ])
    expect(contact.websites).toEqual(['https://example.com'])
    expect(contact.birthday).toBe('19900403')
  })

  it('accepts inline base64 photos and rejects external photo URIs', () => {
    const base64Contact = parseVCard(
      ['BEGIN:VCARD', 'VERSION:3.0', 'FN:Jane Doe', 'PHOTO;ENCODING=BASE64;TYPE=JPEG:AAABBB', 'END:VCARD'].join('\r\n'),
      'fallback-id'
    )
    const dataUriContact = parseVCard(
      ['BEGIN:VCARD', 'VERSION:3.0', 'FN:Jane Doe', 'PHOTO;VALUE=URI:data:image/png;base64,CCCDDD', 'END:VCARD'].join('\r\n'),
      'fallback-id'
    )
    // External http URLs must be discarded to prevent third-party tracking
    const externalUriContact = parseVCard(
      ['BEGIN:VCARD', 'VERSION:3.0', 'FN:Jane Doe', 'PHOTO;VALUE=URI:https://example.com/avatar.jpg', 'END:VCARD'].join('\r\n'),
      'fallback-id'
    )

    expect(base64Contact.photoUrl).toBe('data:image/jpeg;base64,AAABBB')
    expect(dataUriContact.photoUrl).toBe('data:image/png;base64,CCCDDD')
    expect(externalUriContact.photoUrl).toBeUndefined()
  })

  it('uses only the first TYPE value when PHOTO has multiple TYPE tokens', () => {
    const contact = parseVCard(
      ['BEGIN:VCARD', 'VERSION:3.0', 'FN:Jane Doe', 'PHOTO;ENCODING=BASE64;TYPE=JPEG,PNG:AAABBB', 'END:VCARD'].join('\r\n'),
      'fallback-id'
    )
    expect(contact.photoUrl).toBe('data:image/jpeg;base64,AAABBB')
  })

  it('unescapes escaped values in structured and text fields', () => {
    const contact = parseVCard(
      [
        'BEGIN:VCARD',
        'VERSION:3.0',
        'FN:Doe\\, Jane',
        'N:Doe\\, Jr;Jane;;;',
        'NOTE:Line 1\\nLine 2',
        'ORG:ACME\\; Inc;R&D',
        'END:VCARD'
      ].join('\r\n'),
      'fallback-id'
    )

    expect(contact.displayName).toBe('Doe, Jane')
    expect(contact.lastName).toBe('Doe, Jr')
    expect(contact.note).toBe('Line 1\nLine 2')
    expect(contact.organization).toBe('ACME; Inc')
    expect(contact.department).toBe('R&D')
  })

  it('parses legacy bare TYPE parameters', () => {
    const contact = parseVCard(
      [
        'BEGIN:VCARD',
        'VERSION:3.0',
        'FN:Jane Doe',
        'EMAIL;INTERNET;WORK:jane@example.com',
        'TEL;CELL:+49123',
        'ADR;HOME:;;Main St;Berlin;;;DE',
        'END:VCARD'
      ].join('\r\n'),
      'fallback-id'
    )

    expect(contact.emails[0].type).toBe('INTERNET,WORK')
    expect(contact.phones[0].type).toBe('CELL')
    expect(contact.addresses[0].type).toBe('HOME')
  })

  it('parses department from ORG and custom fields', () => {
    const contact = parseVCard(
      [
        'BEGIN:VCARD',
        'VERSION:3.0',
        'FN:Jane Doe',
        'ORG:ACME;Engineering',
        'X-CUSTOM1:foo',
        'X-CUSTOM3:bar',
        'END:VCARD'
      ].join('\r\n'),
      'fallback-id'
    )

    expect(contact.organization).toBe('ACME')
    expect(contact.department).toBe('Engineering')
    expect(contact.custom1).toBe('foo')
    expect(contact.custom3).toBe('bar')
    expect(contact.custom2).toBeUndefined()
  })

  it('correctly decodes folded QUOTED-PRINTABLE soft-break lines', () => {
    const contact = parseVCard(
      'BEGIN:VCARD\r\nVERSION:3.0\r\nFN;ENCODING=QUOTED-PRINTABLE;CHARSET=UTF-8:M=C3=BCller=\r\n =20Test\r\nEND:VCARD',
      'fallback-id'
    )
    expect(contact.displayName).toBe('Müller Test')
  })
})

describe('parseCardDAVReport', () => {
  it('extracts href and vcard payloads from namespaced report XML', () => {
    const xml = `
      <d:multistatus xmlns:d="DAV:" xmlns:cr="urn:ietf:params:xml:ns:carddav">
        <d:response>
          <d:href>/carddav/book/jane.vcf</d:href>
          <d:propstat>
            <d:prop>
              <cr:address-data>BEGIN:VCARD
VERSION:3.0
FN:Jane Doe
END:VCARD</cr:address-data>
            </d:prop>
          </d:propstat>
        </d:response>
        <d:response>
          <d:href>/carddav/book/john.vcf</d:href>
          <d:propstat>
            <d:prop>
              <cr:address-data>BEGIN:VCARD
VERSION:3.0
FN:John Doe
END:VCARD</cr:address-data>
            </d:prop>
          </d:propstat>
        </d:response>
      </d:multistatus>
    `

    expect(parseCardDAVReport(xml)).toEqual([
      {
        href: '/carddav/book/jane.vcf',
        vcardRaw: 'BEGIN:VCARD\nVERSION:3.0\nFN:Jane Doe\nEND:VCARD'
      },
      {
        href: '/carddav/book/john.vcf',
        vcardRaw: 'BEGIN:VCARD\nVERSION:3.0\nFN:John Doe\nEND:VCARD'
      }
    ])
  })
})

describe('parseAddressBookPropfind', () => {
  it('finds namespaced address books in propfind responses', () => {
    const xml = `
      <d:multistatus xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">
        <d:response>
          <d:href>/carddav/users/frank/contacts/</d:href>
          <d:propstat>
            <d:prop>
              <d:resourcetype><d:collection/><card:addressbook/></d:resourcetype>
            </d:prop>
          </d:propstat>
        </d:response>
        <d:response>
          <d:href>/carddav/users/frank/</d:href>
          <d:propstat>
            <d:prop>
              <d:resourcetype><d:collection/></d:resourcetype>
            </d:prop>
          </d:propstat>
        </d:response>
      </d:multistatus>`

    const result = parseAddressBookPropfind(xml)
    expect(result).toEqual(['/carddav/users/frank/contacts/'])
  })
})

