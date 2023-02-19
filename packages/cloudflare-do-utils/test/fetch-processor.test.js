import { describe, it, expect } from 'vitest'

import { FetchProcessor } from '../src/fetch-processor.js'

describe('FetchProcessor', () => {
  it('should have some content type processors', () => {
    expect(FetchProcessor.contentTypes['application/cbor'] != null).toBe(true)
  })
})
