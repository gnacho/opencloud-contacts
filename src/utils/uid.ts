/**
 * RFC 4122 v4 UID. `crypto.randomUUID` is only available in a secure context
 * (https or localhost); on a plain-http LAN deployment it is undefined and
 * calling it throws a TypeError. `crypto.getRandomValues` IS available on
 * insecure origins, so the UUID is built from it as a fallback.
 */
export function newUid(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()

  const bytes = c.getRandomValues(new Uint8Array(new ArrayBuffer(16)))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`
}
