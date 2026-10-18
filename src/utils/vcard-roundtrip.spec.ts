import { describe, expect, it } from 'vitest'
import type { Contact } from '../types/contact'
import { parseVCard } from './vcard-parser'
import { contactToVCard } from './vcard-builder'

/** The invariant: what I upload contains everything I read. */
function model(c: Contact) {
  return {
    uid: c.uid,
    displayName: c.displayName,
    firstName: c.firstName,
    lastName: c.lastName,
    middleName: c.middleName,
    prefix: c.prefix,
    suffix: c.suffix,
    organization: c.organization,
    department: c.department,
    title: c.title,
    nickname: c.nickname,
    note: c.note,
    birthday: c.birthday,
    emails: c.emails,
    phones: c.phones,
    addresses: c.addresses,
    websites: c.websites,
    categories: c.categories,
    custom1: c.custom1,
    custom2: c.custom2,
    custom3: c.custom3,
    custom4: c.custom4,
    photoUrl: c.photoUrl,
    unrecognized: c.unrecognized
  }
}

function roundTrip(raw: string): Contact {
  const parsed = parseVCard(raw, 'fallback')
  return parseVCard(contactToVCard(parsed), 'fallback')
}

function card(...lines: string[]): string {
  return lines.join('\r\n')
}

// Real-world shapes: iOS and DAVx5 group properties under item1.*, Google and
// Thunderbird carry X- properties, phones arrive as vCard 4.0 URIs and lines
// arrive folded. Each entry mirrors a concrete client export.
const CORPUS: { name: string; raw: string }[] = [
  {
    name: 'iOS vCard 3.0 with grouped properties, label and base64 photo',
    raw: card(
      'BEGIN:VCARD',
      'VERSION:3.0',
      'N:Doe;Jane;Marie;Dr.;PhD',
      'FN:Dr. Jane Marie Doe PhD',
      'ORG:Apple;Engineering',
      'TITLE:Engineer',
      'item1.TEL;type=CELL;type=pref:+34 600 111 222',
      'item1.EMAIL;type=INTERNET,WORK:jane@example.com',
      'item1.X-ABLABEL:Work direct',
      'PHOTO;ENCODING=b;TYPE=JPEG:/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAAQABABAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACv/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
      'REV:20260102T030405Z',
      'UID:ios-001',
      'END:VCARD'
    )
  },
  {
    name: 'DAVx5 vCard 4.0 with tel URI phone and full address',
    raw: card(
      'BEGIN:VCARD',
      'VERSION:4.0',
      'FN:Max Mustermann',
      'N:Mustermann;Max;;',
      'TEL;PREF=1;VALUE=uri:tel:+49 30 901 820',
      'TEL;TYPE=CELL:+49 151 234 567',
      'EMAIL;TYPE=HOME:max@example.org',
      'ADR;TYPE=HOME:;;Musterstraße 1;Berlin;;10115;DE',
      'BDAY:19900403',
      'KIND:individual',
      'UID:davx5-001',
      'END:VCARD'
    )
  },
  {
    name: 'Thunderbird vCard 3.0 with X- properties and multiline note',
    raw: card(
      'BEGIN:VCARD',
      'VERSION:3.0',
      'N:Pérez;Brontë;;',
      'FN:Brontë Pérez',
      'EMAIL;TYPE=INTERNET,WORK:perez@example.com',
      'NOTE:Line one\\nLine two with = signs',
      'X-MOZILLA-HTML:FALSE',
      'UID:tb-001',
      'END:VCARD'
    )
  },
  {
    name: 'Google-style vCard 3.0 with categories, IMPP and a VOICE phone',
    raw: card(
      'BEGIN:VCARD',
      'VERSION:3.0',
      'N:Schmidt;Anna;;',
      'FN:Anna Schmidt',
      'ORG:Beispiel GmbH;Vertrieb',
      'TITLE:Leiterin',
      'TEL;TYPE=WORK:+49 30 555',
      'TEL;TYPE=VOICE:+49 30 556',
      'CATEGORIES:Kunden,Intern',
      'IMPP:xmpp:anna@example.com',
      'UID:google-001',
      'END:VCARD'
    )
  },
  {
    name: 'vCard 3.0 minimal',
    raw: card('BEGIN:VCARD', 'VERSION:3.0', 'FN:Plain Jane', 'UID:minimal3-001', 'END:VCARD')
  },
  {
    name: 'vCard 4.0 minimal',
    raw: card('BEGIN:VCARD', 'VERSION:4.0', 'FN:Plain John', 'UID:minimal4-001', 'END:VCARD')
  },
  {
    name: 'folded lines',
    raw: card(
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:Long Display Name That Does Not Fit In Sev',
      ' entry-Five Characters',
      'NOTE:A very long note that arrives folded across lines with a contin',
      ' uation that must be unfolded before parsing anything at all',
      'UID:folded-001',
      'END:VCARD'
    )
  },
  {
    name: 'vCard 4.0 data-URI photo',
    raw: card(
      'BEGIN:VCARD',
      'VERSION:4.0',
      'FN:Photo Person',
      'PHOTO:data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'UID:photo4-001',
      'END:VCARD'
    )
  }
]

describe('vCard round-trip over a real-world corpus', () => {
  for (const { name, raw } of CORPUS) {
    it(`parse(build(parse(x))) equals parse(x): ${name}`, () => {
      expect(model(roundTrip(raw))).toEqual(model(parseVCard(raw, 'fallback')))
    })
  }

  it('keeps unrecognised properties instead of erasing them on save', () => {
    const raw = card(
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:Jane Doe',
      'item1.X-ABLABEL:Work direct',
      'REV:20260102T030405Z',
      'UID:keep-001',
      'END:VCARD'
    )
    const reparsed = roundTrip(raw)
    expect(reparsed.unrecognized?.join('\n')).toContain('item1.X-ABLABEL:Work direct')
    expect(reparsed.unrecognized?.join('\n')).toContain('REV:20260102T030405Z')
  })

  it('documents that ORG parts beyond the second are not modelled', () => {
    // ORG:Company;Department;Team — the app models organization and
    // department only. Pinned until a third field lands.
    const raw = card(
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:Org Person',
      'ORG:Company;Department;Team',
      'UID:org-001',
      'END:VCARD'
    )
    const parsed = parseVCard(raw, 'fallback')
    expect(parsed.organization).toBe('Company')
    expect(parsed.department).toBe('Department')
    expect(model(roundTrip(raw))).toEqual(model(parsed))
  })
})
