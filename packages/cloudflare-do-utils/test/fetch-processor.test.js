// 3rd party imports
import { describe, it, expect, expectTypeOf } from 'vitest'

// local imports
import './fetch-polyfill.js'  // Adds Request, Response, Headers to globalThis
import { FetchProcessor } from '../src/fetch-processor.js'

describe('FetchProcessor', () => {
  it('should have some content type processors', () => {
    expect(FetchProcessor.contentTypes['application/cbor'] != null).toBe(true)
  })

  it('should serialize and deserialize CBOR', async () => {
    const contentType = 'application/cbor'
    const repeatedObject = { b: 2 }
    const o = { a: 1, repeatedObject, repeatedObject2: repeatedObject }
    const processor = new FetchProcessor(
      {},
      'test-id',
      new Request('http://fake.host/experimenter/v1/', { headers: { 'Content-Type': contentType } }),
    )
    expect(processor).toBeInstanceOf(FetchProcessor)
    const serializedObject = await processor.serialize(o, contentType)
    expect(serializedObject).toBeInstanceOf(Uint8Array)
    const newRequest = new Request(
      'http://fake.host/experimenter/v1/',
      {
        method: 'POST',
        headers: { 'Content-Type': contentType },
        body: serializedObject,
      },
    )
    const deserializedObject = await processor.deserialize(newRequest)
    expect(deserializedObject).toStrictEqual(o)
    expect(deserializedObject.repeatedObject).toBe(deserializedObject.repeatedObject2)
  })

  it('should serialize and deserialize JSON', async () => {
    const contentType = 'application/json'
    const repeatedObject = { b: 2 }
    const o = { a: 1, repeatedObject, repeatedObject2: repeatedObject }
    const processor = new FetchProcessor(
      {},
      'test-id',
      new Request('http://fake.host/experimenter/v1/', { headers: { 'Content-Type': contentType } }),
    )
    expect(processor).toBeInstanceOf(FetchProcessor)
    const serializedObject = await processor.serialize(o, contentType)
    expectTypeOf(serializedObject).toBeString()
    const newRequest = new Request(
      'http://fake.host/experimenter/v1/',
      {
        method: 'POST',
        headers: { 'Content-Type': contentType },
        body: serializedObject,
      },
    )
    const deserializedObject = await processor.deserialize(newRequest)
    expect(deserializedObject).toStrictEqual(o)
  })
})
