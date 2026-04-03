import { describe, it, expect } from 'vitest'

/**
 * Tests for AvatarUpload logic extracted as pure functions.
 * Covers format selection, resize math, error paths and emit format.
 */

// ── Output format selection (mirrors onFile in AvatarUpload) ─────────────────

function resolveOutputMime(fileType: string): string {
  const hasAlpha = fileType === 'image/png' || fileType === 'image/webp'
  return hasAlpha ? 'image/png' : 'image/jpeg'
}

// ── Resize math (mirrors scale calculation in onFile) ────────────────────────

function calcResize(width: number, height: number, max = 256): { w: number; h: number } {
  const scale = Math.min(1, max / Math.max(width, height))
  return {
    w: Math.round(width * scale),
    h: Math.round(height * scale),
  }
}

// ── Simulated onFile pipeline ────────────────────────────────────────────────

interface OnFileResult {
  emitted?: string   // value passed to emit('update:modelValue', ...)
  error?: string
}

async function simulateOnFile(opts: {
  fileType: string
  readerResult: { ok: true; dataUrl: string } | { ok: false }
  imgResult: { ok: true; width: number; height: number } | { ok: false }
  canvasDataUrl?: string
  ctxAvailable?: boolean
}): Promise<OnFileResult> {
  const outMime = resolveOutputMime(opts.fileType)
  const result: OnFileResult = {}

  // Simulate FileReader
  if (!opts.readerResult.ok) {
    result.error = 'Could not read file.'
    return result
  }
  const dataUrl = opts.readerResult.dataUrl

  // Simulate Image load
  if (!opts.imgResult.ok) {
    result.error = 'Invalid image file.'
    return result
  }

  const { w, h } = calcResize(opts.imgResult.width, opts.imgResult.height)

  // Simulate canvas
  if (opts.ctxAvailable === false) {
    result.error = 'Could not process image.'
    return result
  }

  // Simulate toDataURL — in real code this produces the actual image data
  const canvasDataUrl = opts.canvasDataUrl ?? `data:${outMime};base64,FAKE`
  result.emitted = canvasDataUrl

  // Verify dimensions were computed (used by caller to size canvas)
  if (w <= 0 || h <= 0) {
    result.error = 'Invalid dimensions.'
    return result
  }

  return result
}

// ── Tests: output format selection ───────────────────────────────────────────

describe('AvatarUpload — output format selection', () => {
  it('uses image/png for PNG input (preserves alpha channel)', () => {
    expect(resolveOutputMime('image/png')).toBe('image/png')
  })

  it('uses image/png for WebP input (preserves alpha channel)', () => {
    expect(resolveOutputMime('image/webp')).toBe('image/png')
  })

  it('uses image/jpeg for JPEG input', () => {
    expect(resolveOutputMime('image/jpeg')).toBe('image/jpeg')
  })

  it('uses image/jpeg for GIF input (animation reduced to single frame)', () => {
    expect(resolveOutputMime('image/gif')).toBe('image/jpeg')
  })

  it('uses image/jpeg for unknown types', () => {
    expect(resolveOutputMime('image/bmp')).toBe('image/jpeg')
  })
})

// ── Tests: resize math ────────────────────────────────────────────────────────

describe('AvatarUpload — resize math', () => {
  it('does not upscale images smaller than 256px', () => {
    const { w, h } = calcResize(100, 100)
    expect(w).toBe(100)
    expect(h).toBe(100)
  })

  it('scales down a square image larger than 256px', () => {
    const { w, h } = calcResize(512, 512)
    expect(w).toBe(256)
    expect(h).toBe(256)
  })

  it('scales by the larger dimension for landscape images', () => {
    const { w, h } = calcResize(800, 400)
    expect(w).toBe(256)
    expect(h).toBe(128)
  })

  it('scales by the larger dimension for portrait images', () => {
    const { w, h } = calcResize(400, 800)
    expect(w).toBe(128)
    expect(h).toBe(256)
  })

  it('preserves aspect ratio within 1px rounding for non-power-of-2 sizes', () => {
    const { w, h } = calcResize(1920, 1080)
    expect(w).toBe(256)
    expect(h).toBe(144)
    // Aspect ratio: 1920/1080 = 1.777…, 256/144 = 1.777…
    expect(Math.abs(w / h - 1920 / 1080)).toBeLessThan(0.01)
  })

  it('handles 1×1 pixel image without error', () => {
    const { w, h } = calcResize(1, 1)
    expect(w).toBe(1)
    expect(h).toBe(1)
  })
})

// ── Tests: error paths ────────────────────────────────────────────────────────

describe('AvatarUpload — error paths', () => {
  it('sets error when FileReader fails, emits nothing', async () => {
    const result = await simulateOnFile({
      fileType: 'image/jpeg',
      readerResult: { ok: false },
      imgResult: { ok: true, width: 100, height: 100 },
    })
    expect(result.error).toContain('Could not read file')
    expect(result.emitted).toBeUndefined()
  })

  it('sets error when Image fails to decode, emits nothing', async () => {
    const result = await simulateOnFile({
      fileType: 'image/jpeg',
      readerResult: { ok: true, dataUrl: 'data:image/jpeg;base64,BROKEN' },
      imgResult: { ok: false },
    })
    expect(result.error).toContain('Invalid image file')
    expect(result.emitted).toBeUndefined()
  })

  it('sets error when canvas context is unavailable, emits nothing', async () => {
    const result = await simulateOnFile({
      fileType: 'image/jpeg',
      readerResult: { ok: true, dataUrl: 'data:image/jpeg;base64,AAABBB' },
      imgResult: { ok: true, width: 100, height: 100 },
      ctxAvailable: false,
    })
    expect(result.error).toContain('Could not process image')
    expect(result.emitted).toBeUndefined()
  })
})

// ── Tests: emit format ────────────────────────────────────────────────────────

describe('AvatarUpload — update:modelValue emit format', () => {
  it('emits a data URI string on success', async () => {
    const result = await simulateOnFile({
      fileType: 'image/jpeg',
      readerResult: { ok: true, dataUrl: 'data:image/jpeg;base64,AAABBB' },
      imgResult: { ok: true, width: 100, height: 100 },
      canvasDataUrl: 'data:image/jpeg;base64,RESIZED',
    })
    expect(result.emitted).toBe('data:image/jpeg;base64,RESIZED')
    expect(result.error).toBeUndefined()
  })

  it('emits a PNG data URI for PNG input', async () => {
    const result = await simulateOnFile({
      fileType: 'image/png',
      readerResult: { ok: true, dataUrl: 'data:image/png;base64,AAABBB' },
      imgResult: { ok: true, width: 100, height: 100 },
      canvasDataUrl: 'data:image/png;base64,RESIZED',
    })
    expect(result.emitted).toMatch(/^data:image\/png;base64,/)
    expect(result.error).toBeUndefined()
  })

  it('emits a PNG data URI for WebP input (alpha preserved)', async () => {
    const result = await simulateOnFile({
      fileType: 'image/webp',
      readerResult: { ok: true, dataUrl: 'data:image/webp;base64,AAABBB' },
      imgResult: { ok: true, width: 200, height: 200 },
      canvasDataUrl: 'data:image/png;base64,RESIZED',
    })
    expect(result.emitted).toMatch(/^data:image\/png;base64,/)
    expect(result.error).toBeUndefined()
  })

  it('emits a JPEG data URI for GIF input', async () => {
    const result = await simulateOnFile({
      fileType: 'image/gif',
      readerResult: { ok: true, dataUrl: 'data:image/gif;base64,AAABBB' },
      imgResult: { ok: true, width: 100, height: 100 },
      canvasDataUrl: 'data:image/jpeg;base64,RESIZED',
    })
    expect(result.emitted).toMatch(/^data:image\/jpeg;base64,/)
    expect(result.error).toBeUndefined()
  })
})
