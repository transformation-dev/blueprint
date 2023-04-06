// 3rd party imports
import { describe, it, expect, expectTypeOf } from 'vitest'

// local imports
import { requestIn, requestOut, responseIn, responseOut, errorResponseOut,
  contentProcessors,
} from '../src/content-processor.js'
import { HTTPError } from '../src/http-error.js'

describe('Content Processor', () => {
  it('should have some content processors', () => {
    expect(contentProcessors['application/cbor'] != null).toBe(true)
  })

  it('should serialize and deserialize JSON via requestIn and requestOut', async () => {
    const contentType = 'application/json'
    const repeatedObject = { b: 2 }
    const o = { a: 1, repeatedObject, repeatedObject2: repeatedObject }
    const requestOutResult = await requestOut('http://fake.host', { method: 'POST', body: o, headers: { 'Content-Type': contentType } })
    const requestInResult = await requestIn(requestOutResult)
    expect(requestInResult.content).toStrictEqual(o)
  })

  it('should serialize and deserialize CBOR via requestIn and requestOut', async () => {
    const contentType = 'application/cbor'
    const repeatedObject = { b: 2 }
    const o = { a: 1, repeatedObject, repeatedObject2: repeatedObject }
    const requestOutResult = await requestOut('http://fake.host', { method: 'POST', body: o, headers: { 'Content-Type': contentType } })
    const requestInResult = await requestIn(requestOutResult)
    expect(requestInResult.content).toStrictEqual(o)
    expect(requestInResult.content.repeatedObject).toBe(requestInResult.content.repeatedObject2)
  })

  it('should serialize and deserialize CBOR via responseOut and responseIn', async () => {
    const repeatedObject = { b: 2 }
    const o = { a: 1, repeatedObject, repeatedObject2: repeatedObject }
    const responseOutResult = await responseOut(o)  // tests default content type and status
    const responseInResult = await responseIn(responseOutResult)
    expect(responseInResult.content).toStrictEqual(o)
    expect(responseInResult.content.repeatedObject).toBe(responseInResult.content.repeatedObject2)
  })

  it('should serialize an HTTPError', async () => {
    const error = new HTTPError('test error', 400)
    const responseOutResult = await errorResponseOut(error)
    expect(responseOutResult.status).toBe(400)
    expect(responseOutResult.headers.get('Content-Type')).toBe('application/cbor')
    const responseInResult = await responseIn(responseOutResult)
    expect(responseInResult.content).toMatchObject({ error: { message: 'test error' } })
  })
})
