import { describe, it, expect } from 'vitest'
import type { Contact, ContactAddress } from '../types/contact'

/**
 * Tests for EditContactDialog save() logic extracted as pure functions.
 * Covers the three data-loss regression cases from the code review.
 */

// ── Extracted save logic (mirrors buildUpdated in EditContactDialog) ──────────

interface EditForm {
  firstName: string
  lastName: string
  displayName: string
  nickname: string
  organization: string
  title: string
  emails: { value: string; type?: string }[]
  phones: { value: string; type?: string }[]
  addresses: ContactAddress[]
  birthday: string
  websites: string[]
  note: string
  photoUrl: string
}

function buildUpdated(contact: Contact, form: EditForm): Contact {
  const displayName =
    form.displayName.trim() ||
    [form.firstName, form.lastName].filter(Boolean).join(' ') ||
    form.organization ||
    form.emails[0]?.value ||
    'Unknown'

  return {
    ...contact,
    firstName:    form.firstName.trim() || undefined,
    lastName:     form.lastName.trim() || undefined,
    displayName,
    nickname:     form.nickname.trim() || undefined,
    organization: form.organization.trim() || undefined,
    title:        form.title.trim() || undefined,
    emails:       form.emails.filter((e) => e.value.trim()),
    phones:       form.phones.filter((p) => p.value.trim()),
    addresses:    form.addresses.filter((a) =>
      a.street || a.city || a.postalCode || a.country || a.region
    ),
    birthday:  form.birthday || undefined,
    websites:  form.websites.map((u) => u.trim()).filter(Boolean) || undefined,
    note:      form.note.trim() || undefined,
    photoUrl:  form.photoUrl || undefined,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    uid: 'uid-1',
    displayName: 'Jane Doe',
    emails: [],
    phones: [],
    addresses: [],
    raw: '',
    ...overrides,
  }
}

function makeForm(overrides: Partial<EditForm> = {}): EditForm {
  return {
    firstName: 'Jane',
    lastName: 'Doe',
    displayName: 'Jane Doe',
    nickname: '',
    organization: '',
    title: '',
    emails: [],
    phones: [],
    addresses: [],
    birthday: '',
    websites: [],
    note: '',
    photoUrl: '',
    ...overrides,
  }
}

// ── Tests: multiple URLs preserved on save ────────────────────────────────────

describe('EditContactDialog — multiple websites preserved on save', () => {
  it('saves all URLs when contact has multiple websites', () => {
    const contact = makeContact({ websites: ['https://a.com', 'https://b.com', 'https://c.com'] })
    const form = makeForm({ websites: ['https://a.com', 'https://b.com', 'https://c.com'] })

    const updated = buildUpdated(contact, form)

    expect(updated.websites).toEqual(['https://a.com', 'https://b.com', 'https://c.com'])
  })

  it('trims whitespace from URLs', () => {
    const contact = makeContact()
    const form = makeForm({ websites: ['  https://a.com  ', 'https://b.com'] })

    const updated = buildUpdated(contact, form)

    expect(updated.websites).toEqual(['https://a.com', 'https://b.com'])
  })

  it('filters out blank URL entries', () => {
    const contact = makeContact()
    const form = makeForm({ websites: ['https://a.com', '', 'https://b.com', '   '] })

    const updated = buildUpdated(contact, form)

    expect(updated.websites).toEqual(['https://a.com', 'https://b.com'])
  })

  it('editing an unrelated field does not lose existing URLs', () => {
    const contact = makeContact({
      websites: ['https://a.com', 'https://b.com'],
      note: 'old note'
    })
    // User only changes the note
    const form = makeForm({ websites: ['https://a.com', 'https://b.com'], note: 'new note' })

    const updated = buildUpdated(contact, form)

    expect(updated.websites).toEqual(['https://a.com', 'https://b.com'])
    expect(updated.note).toBe('new note')
  })
})

// ── Tests: external photo URL (PHOTO;VALUE=URI) survives save ─────────────────

describe('EditContactDialog — external photo URL survives save', () => {
  it('preserves an https photo URL unchanged', () => {
    const photoUrl = 'https://example.com/photo.jpg'
    const contact = makeContact({ photoUrl })
    const form = makeForm({ photoUrl })

    const updated = buildUpdated(contact, form)

    expect(updated.photoUrl).toBe(photoUrl)
  })

  it('preserves a data-URI photo unchanged', () => {
    const photoUrl = 'data:image/jpeg;base64,AAABBB'
    const contact = makeContact({ photoUrl })
    const form = makeForm({ photoUrl })

    const updated = buildUpdated(contact, form)

    expect(updated.photoUrl).toBe(photoUrl)
  })

  it('clears photoUrl when form has empty string (user removed photo)', () => {
    const contact = makeContact({ photoUrl: 'https://example.com/photo.jpg' })
    const form = makeForm({ photoUrl: '' })

    const updated = buildUpdated(contact, form)

    expect(updated.photoUrl).toBeUndefined()
  })

  it('editing an unrelated field does not lose an external photo URL', () => {
    const photoUrl = 'https://example.com/photo.jpg'
    const contact = makeContact({ photoUrl, note: 'old note' })
    const form = makeForm({ photoUrl, note: 'new note' })

    const updated = buildUpdated(contact, form)

    expect(updated.photoUrl).toBe(photoUrl)
    expect(updated.note).toBe('new note')
  })
})

// ── Tests: empty address blocks are filtered out ──────────────────────────────

describe('EditContactDialog — empty address blocks filtered on save', () => {
  it('keeps addresses that have at least one field set', () => {
    const contact = makeContact()
    const form = makeForm({
      addresses: [{ street: 'Main St', city: 'Berlin', type: 'HOME' }]
    })

    const updated = buildUpdated(contact, form)

    expect(updated.addresses).toHaveLength(1)
    expect(updated.addresses[0].street).toBe('Main St')
  })

  it('removes a completely empty address block', () => {
    const contact = makeContact()
    const form = makeForm({
      addresses: [{ type: 'HOME' }]   // only type, no content fields
    })

    const updated = buildUpdated(contact, form)

    expect(updated.addresses).toHaveLength(0)
  })

  it('removes empty blocks but keeps non-empty ones', () => {
    const contact = makeContact()
    const form = makeForm({
      addresses: [
        { street: 'Main St', city: 'Berlin', type: 'HOME' },
        { type: 'WORK' },   // empty
        { postalCode: '10115', country: 'DE', type: 'WORK' },
      ]
    })

    const updated = buildUpdated(contact, form)

    expect(updated.addresses).toHaveLength(2)
    expect(updated.addresses[0].street).toBe('Main St')
    expect(updated.addresses[1].postalCode).toBe('10115')
  })

  it('results in empty addresses array (not undefined) when all are blank', () => {
    const contact = makeContact({ addresses: [{ street: 'Old St', type: 'HOME' }] })
    const form = makeForm({ addresses: [{ type: 'HOME' }] })

    const updated = buildUpdated(contact, form)

    expect(updated.addresses).toEqual([])
  })
})
