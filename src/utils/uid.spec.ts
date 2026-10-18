import { afterEach, describe, expect, it, vi } from 'vitest'
import { newUid } from './uid'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('newUid', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('uses crypto.randomUUID when the secure context provides it', () => {
    const randomUUID = vi.fn(() => '11111111-2222-4333-8444-555555555555')
    vi.stubGlobal('crypto', { ...globalThis.crypto, randomUUID })

    expect(newUid()).toBe('11111111-2222-4333-8444-555555555555')
    expect(randomUUID).toHaveBeenCalledOnce()
  })

  it('falls back to crypto.getRandomValues on plain http (no secure context)', () => {
    // crypto.randomUUID is secure-context only and is absent on a LAN http
    // deployment; getRandomValues stays available there.
    const realCrypto = globalThis.crypto
    vi.stubGlobal('crypto', {
      getRandomValues: (arr: Uint8Array<ArrayBuffer>) => realCrypto.getRandomValues(arr)
    })

    expect(newUid()).toMatch(UUID_V4)
  })
})
