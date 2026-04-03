import { describe, it, expect } from 'vitest'

/**
 * Extracted logic from NewContactDialog — tested in isolation.
 * These cover the three regressions identified in the code review.
 */

// ── displayName fallback (mirrors save() in NewContactDialog) ──────────────

function resolveDisplayName(form: {
  displayName: string
  firstName: string
  lastName: string
  organization: string
  emails: { value: string }[]
}): string {
  return (
    form.displayName.trim() ||
    [form.firstName, form.lastName].filter(Boolean).join(' ') ||
    form.organization.trim() ||
    form.emails[0]?.value.trim() ||
    'Unknown'
  )
}

// ── syncDisplayName (only updates when user has not set displayName) ────────

function makeSyncDisplayName(state: { displayName: string; displayNameManual: boolean }) {
  return function syncDisplayName(firstName: string, lastName: string) {
    if (state.displayNameManual) return
    state.displayName = [firstName, lastName].filter(Boolean).join(' ')
  }
}

// ── href stored after putContact ────────────────────────────────────────────

interface StoredContact { uid: string; href?: string; displayName: string }

async function simulateCreate(
  putContact: (uid: string, vcard: string) => Promise<string>
): Promise<StoredContact> {
  const uid = 'test-uid-123'
  const href = await putContact(uid, 'BEGIN:VCARD\r\nEND:VCARD')
  return { uid, href, displayName: 'Test User' }
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('NewContactDialog — displayName fallback', () => {
  it('uses explicit displayName when set', () => {
    expect(resolveDisplayName({
      displayName: 'Custom Name',
      firstName: 'Jane', lastName: 'Doe',
      organization: 'ACME',
      emails: [{ value: 'jane@example.com' }]
    })).toBe('Custom Name')
  })

  it('falls back to firstName + lastName when displayName is empty', () => {
    expect(resolveDisplayName({
      displayName: '',
      firstName: 'Jane', lastName: 'Doe',
      organization: '', emails: []
    })).toBe('Jane Doe')
  })

  it('falls back to organization when name fields are empty', () => {
    expect(resolveDisplayName({
      displayName: '',
      firstName: '', lastName: '',
      organization: 'ACME Ltd', emails: []
    })).toBe('ACME Ltd')
  })

  it('falls back to email when name and org are empty', () => {
    expect(resolveDisplayName({
      displayName: '',
      firstName: '', lastName: '',
      organization: '',
      emails: [{ value: 'jane@example.com' }]
    })).toBe('jane@example.com')
  })

  it('falls back to "Unknown" when all fields are empty', () => {
    expect(resolveDisplayName({
      displayName: '', firstName: '', lastName: '',
      organization: '', emails: []
    })).toBe('Unknown')
  })
})

describe('NewContactDialog — syncDisplayName respects manual override', () => {
  it('auto-fills displayName from first + last name', () => {
    const state = { displayName: '', displayNameManual: false }
    const sync = makeSyncDisplayName(state)
    sync('Jane', 'Doe')
    expect(state.displayName).toBe('Jane Doe')
  })

  it('does NOT overwrite a manually set displayName', () => {
    const state = { displayName: 'My Custom Name', displayNameManual: true }
    const sync = makeSyncDisplayName(state)
    sync('Jane', 'Doe')
    expect(state.displayName).toBe('My Custom Name')
  })

  it('auto-fill works with only first name', () => {
    const state = { displayName: '', displayNameManual: false }
    const sync = makeSyncDisplayName(state)
    sync('Jane', '')
    expect(state.displayName).toBe('Jane')
  })
})

describe('NewContactDialog — href is set on stored contact after creation', () => {
  it('stores the href returned by putContact', async () => {
    const fakeHref = '/dav/addressbooks/user/default/abc-123.vcf'
    const putContact = async (_uid: string, _vcard: string) => fakeHref

    const stored = await simulateCreate(putContact)
    expect(stored.href).toBe(fakeHref)
  })

  it('propagates putContact errors (no silent failure)', async () => {
    const putContact = async () => { throw new Error('PUT failed: 507') }
    await expect(simulateCreate(putContact)).rejects.toThrow('PUT failed: 507')
  })
})
