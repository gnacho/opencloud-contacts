import { describe, expect, it, vi } from 'vitest'
import type { Contact } from '../types/contact'
import { dedupeContacts } from './contact-dedup'

function contact(uid: string, href: string): Contact {
  return { uid, href, displayName: uid, emails: [], phones: [], addresses: [], raw: '' }
}

describe('dedupeContacts', () => {
  it('drops a resource listed twice under the same href', () => {
    const c = contact('uid-1', '/addressbook/uid-1.vcf')
    expect(dedupeContacts([c, { ...c }])).toHaveLength(1)
  })

  it('keeps both resources when two hrefs share a UID, warning instead of hiding one', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const a = contact('uid-1', '/addressbook/a.vcf')
    const b = contact('uid-1', '/addressbook/b.vcf')
    const result = dedupeContacts([a, b])

    expect(result).toHaveLength(2)
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0][0]).toContain('uid-1')
    expect(warn.mock.calls[0][0]).toContain('/addressbook/b.vcf')
    warn.mockRestore()
  })

  it('does not warn for the same UID seen through the same href', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const a = contact('uid-1', '/addressbook/a.vcf')
    expect(dedupeContacts([a, { ...a }])).toHaveLength(1)
    expect(warn).not.toHaveBeenCalled()

    warn.mockRestore()
  })
})
