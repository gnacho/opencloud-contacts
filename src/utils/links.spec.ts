import { describe, it, expect } from 'vitest'
import { mailtoHref, telHref } from './links'

describe('mailtoHref', () => {
  it('keeps a normal address readable', () => {
    expect(mailtoHref('jane.doe@example.com')).toBe('mailto:jane.doe@example.com')
  })

  it('encodes characters that would add header fields or recipients', () => {
    expect(mailtoHref('a@b.de?bcc=evil@x.de&body=hi')).toBe('mailto:a@b.de%3Fbcc%3Devil@x.de%26body%3Dhi')
    expect(mailtoHref('a@b.de,evil@x.de')).toBe('mailto:a@b.de%2Cevil@x.de')
    expect(mailtoHref('a@b.de#x')).toBe('mailto:a@b.de%23x')
  })
})

describe('telHref', () => {
  it('keeps the leading + and encodes separators', () => {
    expect(telHref('+49 30 1234')).toBe('tel:+49%2030%201234')
    expect(telHref('123?x=1#y')).toBe('tel:123%3Fx%3D1%23y')
  })
})
