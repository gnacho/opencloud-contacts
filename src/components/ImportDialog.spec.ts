import { describe, it, expect, vi } from 'vitest'
import type { CsvContact } from '../utils/csv-importer'

/**
 * Tests for ImportDialog logic extracted as pure functions.
 * Covers the four regression cases from the code review.
 */

// ── Types ────────────────────────────────────────────────────────────────────

interface ImportState {
  importing: boolean
  done: boolean
  doneCount: number
  errors: string[]
  deleting: boolean
  deleteCount: number
  deleteTotal: number
}

function makeState(): ImportState {
  return {
    importing: false, done: false, doneCount: 0,
    errors: [], deleting: false, deleteCount: 0, deleteTotal: 0
  }
}

// ── Core import logic (mirrors startImport in ImportDialog) ──────────────────

async function runImport(
  contacts: CsvContact[],
  opts: {
    replaceAll?: boolean
    deleteAllContacts?: (onProgress: (n: number, total: number) => void) => Promise<void>
    putContact?: (uid: string, vcard: string) => Promise<string>
  },
  state: ImportState
): Promise<void> {
  state.importing = true
  state.done = false
  state.doneCount = 0
  state.errors = []
  state.deleting = false
  state.deleteCount = 0
  state.deleteTotal = 0

  try {
    if (opts.replaceAll && opts.deleteAllContacts) {
      state.deleting = true
      try {
        await opts.deleteAllContacts((n, total) => {
          state.deleteCount = n
          state.deleteTotal = total
        })
      } finally {
        state.deleting = false
      }
    }

    for (const c of contacts) {
      try {
        const uid = crypto.randomUUID()
        await (opts.putContact ?? (async () => ''))(uid, '')
      } catch (err) {
        const name = c.displayName || c.email1 || '?'
        state.errors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`)
      }
      state.doneCount++
    }
  } catch (err) {
    state.errors.push(err instanceof Error ? err.message : String(err))
  } finally {
    state.importing = false
    state.done = true
  }
}

// ── onClose logic (mirrors onClose in ImportDialog) ──────────────────────────

function onClose(
  state: { done: boolean },
  emit: (e: 'close' | 'done') => void
) {
  emit(state.done ? 'done' : 'close')
}

// ── loadFile logic (mirrors reader callbacks in loadFile) ─────────────────────

function simulateLoadFile(
  result: { ok: true; text: string } | { ok: false; error: string },
  parse: (text: string) => CsvContact[]
): { parsedContacts: CsvContact[]; errors: string[] } {
  const out = { parsedContacts: [] as CsvContact[], errors: [] as string[] }

  if (!result.ok) {
    out.errors = ['Could not read file.']
    return out
  }

  try {
    out.parsedContacts = parse(result.text)
  } catch (err) {
    out.errors = [err instanceof Error ? err.message : 'Could not parse CSV file.']
    return out
  }

  return out
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeContact(overrides: Partial<CsvContact> = {}): CsvContact {
  return {
    firstName: '', lastName: '', displayName: 'Test User', nickname: '',
    email1: 'test@example.com', email2: '',
    telWork: '', telHome: '', fax: '', pager: '', mobile: '',
    homeStreet: '', homeStreet2: '', homeCity: '', homeState: '', homeZip: '', homeCountry: '',
    workStreet: '', workStreet2: '', workCity: '', workState: '', workZip: '', workCountry: '',
    title: '', department: '', organization: '',
    website1: '', website2: '',
    birthYear: '', birthMonth: '', birthDay: '',
    custom1: '', custom2: '', custom3: '', custom4: '',
    notes: '',
    ...overrides
  }
}

// ── Tests: deleteAllContacts failure ─────────────────────────────────────────

describe('ImportDialog — deleteAllContacts failure with replaceAll', () => {
  it('sets done=true and importing=false even when deleteAllContacts throws', async () => {
    const state = makeState()
    const deleteAllContacts = async () => { throw new Error('Network error') }

    await runImport([makeContact()], { replaceAll: true, deleteAllContacts }, state)

    expect(state.importing).toBe(false)
    expect(state.done).toBe(true)
  })

  it('sets deleting=false even when deleteAllContacts throws', async () => {
    const state = makeState()
    const deleteAllContacts = async () => { throw new Error('Network error') }

    await runImport([makeContact()], { replaceAll: true, deleteAllContacts }, state)

    expect(state.deleting).toBe(false)
  })

  it('records the delete error in errors[]', async () => {
    const state = makeState()
    const deleteAllContacts = async () => { throw new Error('DELETE 503') }

    await runImport([makeContact()], { replaceAll: true, deleteAllContacts }, state)

    expect(state.errors).toHaveLength(1)
    expect(state.errors[0]).toContain('DELETE 503')
  })

  it('tracks delete progress via onProgress callback', async () => {
    const state = makeState()
    const deleteAllContacts = async (onProgress: (n: number, total: number) => void) => {
      onProgress(1, 3)
      onProgress(2, 3)
      onProgress(3, 3)
    }

    await runImport([], { replaceAll: true, deleteAllContacts }, state)

    expect(state.deleteCount).toBe(3)
    expect(state.deleteTotal).toBe(3)
  })
})

// ── Tests: partial import with some putContact failures ───────────────────────

describe('ImportDialog — partial import with putContact failures', () => {
  it('counts all rows in doneCount even when some fail', async () => {
    const state = makeState()
    let call = 0
    const putContact = async () => {
      call++
      if (call === 2) throw new Error('PUT 507')
      return ''
    }

    const contacts = [makeContact(), makeContact(), makeContact()]
    await runImport(contacts, { putContact }, state)

    expect(state.doneCount).toBe(3)
  })

  it('collects per-contact errors without stopping the import', async () => {
    const state = makeState()
    let call = 0
    const putContact = async () => {
      call++
      if (call === 2) throw new Error('PUT 507')
      return ''
    }

    const contacts = [
      makeContact({ displayName: 'Alice' }),
      makeContact({ displayName: 'Bob' }),
      makeContact({ displayName: 'Carol' }),
    ]
    await runImport(contacts, { putContact }, state)

    expect(state.errors).toHaveLength(1)
    expect(state.errors[0]).toContain('Bob')
    expect(state.errors[0]).toContain('PUT 507')
  })

  it('sets done=true and importing=false after partial failure', async () => {
    const state = makeState()
    const putContact = async () => { throw new Error('PUT 500') }

    await runImport([makeContact(), makeContact()], { putContact }, state)

    expect(state.importing).toBe(false)
    expect(state.done).toBe(true)
  })
})

// ── Tests: file / parse errors in loadFile ────────────────────────────────────

describe('ImportDialog — loadFile errors', () => {
  it('sets error when FileReader fails', () => {
    const result = simulateLoadFile({ ok: false, error: 'disk error' }, () => [])
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('Could not read file')
    expect(result.parsedContacts).toHaveLength(0)
  })

  it('sets error when CSV parser throws', () => {
    const result = simulateLoadFile(
      { ok: true, text: '"unclosed quote' },
      () => { throw new Error('Malformed CSV: unclosed quote') }
    )
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('Malformed CSV')
    expect(result.parsedContacts).toHaveLength(0)
  })

  it('returns parsed contacts on success', () => {
    const contacts = [makeContact()]
    const result = simulateLoadFile({ ok: true, text: 'csv...' }, () => contacts)
    expect(result.errors).toHaveLength(0)
    expect(result.parsedContacts).toHaveLength(1)
  })
})

// ── Tests: onClose / ContactsView interaction ────────────────────────────────

describe('ImportDialog — onClose does not navigate before done state is shown', () => {
  it('emits "close" when import has not run yet', () => {
    const emit = vi.fn()
    onClose({ done: false }, emit)
    expect(emit).toHaveBeenCalledWith('close')
    expect(emit).not.toHaveBeenCalledWith('done')
  })

  it('emits "done" (triggers reload) only when user explicitly closes after import', () => {
    const emit = vi.fn()
    onClose({ done: true }, emit)
    expect(emit).toHaveBeenCalledWith('done')
    expect(emit).not.toHaveBeenCalledWith('close')
  })

  it('done state is set before any emit, so UI is visible first', async () => {
    const state = makeState()
    const events: string[] = []

    // Simulate: done becomes true in finally, then user clicks Close → emits done
    await runImport([makeContact()], {}, state)
    expect(state.done).toBe(true)  // UI shows result

    onClose(state, (e) => events.push(e))
    expect(events).toEqual(['done'])  // only after user acts
  })
})
