import { describe, it, expect } from 'vitest'
import type { Contact } from '../types/contact'
import { exportContactsToCSV, neutralizeFormula } from './csv-exporter'
import { parseThunderbirdCSV } from './csv-importer'

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    uid: 'contact-1',
    displayName: 'Jane Doe',
    emails: [],
    phones: [],
    addresses: [],
    raw: '',
    ...overrides
  }
}

describe('neutralizeFormula', () => {
  it('prefixes formula-like values', () => {
    expect(neutralizeFormula('=HYPERLINK("https://evil")')).toBe(`'=HYPERLINK("https://evil")`)
    expect(neutralizeFormula('+SUM(A1)')).toBe(`'+SUM(A1)`)
    expect(neutralizeFormula("-2+3+cmd|' /C calc'!A0")).toBe(`'-2+3+cmd|' /C calc'!A0`)
    expect(neutralizeFormula('@SUM(A1)')).toBe(`'@SUM(A1)`)
    expect(neutralizeFormula('\t=1')).toBe(`'\t=1`)
  })

  it('leaves plain numbers and ordinary text unchanged', () => {
    expect(neutralizeFormula('+49 (0)30 123-456')).toBe('+49 (0)30 123-456')
    expect(neutralizeFormula('-1.5')).toBe('-1.5')
    expect(neutralizeFormula('Jane Doe')).toBe('Jane Doe')
    expect(neutralizeFormula('')).toBe('')
  })
})

describe('exportContactsToCSV', () => {
  it('neutralizes formulas and round-trips through the importer', () => {
    const csv = exportContactsToCSV([
      makeContact({
        displayName: '=HYPERLINK("https://evil";"Klick")',
        phones: [{ value: '+49 30 1234', type: 'CELL' }]
      })
    ])
    expect(csv).toContain(`"'=HYPERLINK(""https://evil"";""Klick"")"`)
    expect(csv).toContain(',+49 30 1234,')

    const [imported] = parseThunderbirdCSV(csv)
    expect(imported.displayName).toBe('=HYPERLINK("https://evil";"Klick")')
    expect(imported.mobile).toBe('+49 30 1234')
  })
})
