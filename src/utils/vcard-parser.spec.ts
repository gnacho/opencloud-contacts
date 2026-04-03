import { describe, expect, it } from 'vitest'
import { parseCardDAVReport, parseVCard } from './vcard-parser'

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

  it('parses photo URIs and inline base64 photos', () => {
    const uriContact = parseVCard(
      ['BEGIN:VCARD', 'VERSION:3.0', 'FN:Jane Doe', 'PHOTO;VALUE=URI:https://example.com/avatar.jpg', 'END:VCARD'].join('\r\n'),
      'fallback-id'
    )
    const base64Contact = parseVCard(
      ['BEGIN:VCARD', 'VERSION:3.0', 'FN:Jane Doe', 'PHOTO;ENCODING=BASE64;TYPE=JPEG:AAABBB', 'END:VCARD'].join('\r\n'),
      'fallback-id'
    )

    expect(uriContact.photoUrl).toBe('https://example.com/avatar.jpg')
    expect(base64Contact.photoUrl).toBe('data:image/jpeg;base64,AAABBB')
  })

  it.todo('unescapes escaped values in structured and text fields')

  it.todo('parses legacy bare TYPE parameters')
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
  it.todo('finds namespaced address books in propfind responses')
})
