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

  it('neutralizes formulas after ";" for spreadsheets using ";" as delimiter', () => {
    expect(neutralizeFormula('x;=HYPERLINK("https://evil")')).toBe(`x;'=HYPERLINK("https://evil")`)
    expect(neutralizeFormula("x;=cmd|' /C calc'!A0")).toBe(`x;'=cmd|' /C calc'!A0`)
    expect(neutralizeFormula('a;@SUM(A1);b')).toBe(`a;'@SUM(A1);b`)
    // plain numbers and ordinary text after ';' stay intact
    expect(neutralizeFormula('Tel;+49 30 1234')).toBe('Tel;+49 30 1234')
    expect(neutralizeFormula('a;b;c')).toBe('a;b;c')
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

  it('round-trips formulas hidden behind ";" through the importer', () => {
    const note = 'Notiz;=HYPERLINK("https://evil")'
    const csv = exportContactsToCSV([makeContact({ note })])
    expect(csv).toContain(`Notiz;'=HYPERLINK(""https://evil"")`)

    const [imported] = parseThunderbirdCSV(csv)
    expect(imported.notes).toBe(note)
  })
})

describe('export/import round-trip fidelity', () => {
  it('round-trips a tab-led formula value through the importer', () => {
    const csv = exportContactsToCSV([makeContact({ note: '\t=1+1' })])
    const [imported] = parseThunderbirdCSV(csv)
    expect(imported.notes).toBe('\t=1+1')
  })

  it('documents the apostrophe-before-trigger ambiguity as a known loss', () => {
    // neutralizeFormula escapes a leading formula trigger with a ' prefix, so
    // a value that itself starts with '= cannot be told apart from an escaped
    // one on re-import; the apostrophe is lost by design.
    const [imported] = parseThunderbirdCSV(exportContactsToCSV([makeContact({ note: `'=title` })]))
    expect(imported.notes).toBe('=title')
  })

  it('round-trips categories through the extension column', () => {
    const csv = exportContactsToCSV([makeContact({ categories: ['Familie', 'VIP;X'] })])
    const [imported] = parseThunderbirdCSV(csv)
    expect(imported.categories).toEqual(['Familie', 'VIP;X'])
  })

  it('round-trips phones of types the Thunderbird columns do not know', () => {
    const csv = exportContactsToCSV([
      makeContact({
        phones: [
          { value: '+49 30 1', type: 'VOICE' },
          { value: '12345', type: 'X-UNKNOWN' },
          { value: '+34 600', type: 'CELL' }
        ]
      })
    ])
    const [imported] = parseThunderbirdCSV(csv)
    expect(imported.mobile).toBe('+34 600')
    expect(imported.extraPhones).toEqual([
      { value: '+49 30 1', type: 'VOICE' },
      { value: '12345', type: 'X-UNKNOWN' }
    ])
  })
})
