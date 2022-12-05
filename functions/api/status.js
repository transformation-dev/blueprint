import Debug from 'debug'
import { Encoder } from 'cbor-x'
import { negotiatedResponse, getDebug } from '../_utils'

const cbor = new Encoder({ structuredClone: true })

const debug = getDebug('blueprint:api:status')

export async function onRequestGet({ request, env, params }) {
  Debug.enable(env.DEBUG)
  debug('onRequestGet() called')

  const stub = env.COUNTER.get(
    env.COUNTER.idFromName('something'),
  )
  const response = await stub.fetch('/increment')
  const count = await response.json()

  const stub2 = env.TEMPORAL_ENTITY.get(
    env.TEMPORAL_ENTITY.idFromName('some temporal entity'),  // TODO: Use self generated IDs
  )
  const toSend = { value: { a: 2 }, userID: 'larry' }
  const encodedToSend = cbor.encode(toSend)
  const response2 = await stub2.fetch('/', { method: 'PUT', body: encodedToSend })
  const value2ab = await response2.arrayBuffer()
  const u8a = new Uint8Array(value2ab)
  const value2 = cbor.decode(u8a)

  const myResponse = {
    operationNormal: true,
    count,
    value2,
    // env.CF_ENV,  // BE CAREFUL NOT TO EVER COMMIT WITH JUST `env` OR WE'LL LEAK ENVIRONMENT VARIABLES
  }
  return negotiatedResponse(myResponse, request)
}
