import { describe, expect, it } from 'vitest'
import { mergeContacts } from './duplicates'
import type { Contact } from '../types/contact'

function make(over: Partial<Contact>): Contact {
  return {
    uid: over.uid ?? 'x',
    displayName: over.displayName ?? 'Jane Doe',
    emails: [],
    phones: [],
    addresses: [],
    raw: '',
    ...over,
  }
}

describe('mergeContacts — notes are concatenated, not discarded (issue #5)', () => {
  it('keeps every distinct note from the merged contacts', () => {
    const merged = mergeContacts([
      make({ uid: 'a', note: 'nota A' }),
      make({ uid: 'b', note: 'nota B distinta' }),
    ])

    expect(merged.note).toContain('nota A')
    expect(merged.note).toContain('nota B distinta')
  })

  it('does not repeat identical notes', () => {
    const merged = mergeContacts([
      make({ uid: 'a', note: 'misma nota' }),
      make({ uid: 'b', note: 'misma nota' }),
    ])

    expect(merged.note).toBe('misma nota')
  })

  it('keeps the note when the other contact has none', () => {
    const merged = mergeContacts([
      make({ uid: 'a', note: 'solo A' }),
      make({ uid: 'b' }),
    ])

    expect(merged.note).toBe('solo A')
  })

  it('keeps the first value for true scalar fields (unchanged behaviour)', () => {
    const merged = mergeContacts([
      make({ uid: 'a', title: 'Boss', birthday: '19900403' }),
      make({ uid: 'b', title: 'Worker', birthday: '19910505' }),
    ])

    expect(merged.title).toBe('Boss')
    expect(merged.birthday).toBe('19900403')
  })
})
