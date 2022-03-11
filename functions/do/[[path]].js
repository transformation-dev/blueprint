import Debug from 'debug'
import { jsonResponse, getDebug } from '../_utils'

const debug = getDebug('blueprint:do:[[path]]')

export async function onRequestGet({ request, env, params }) {
  Debug.enable(env.DEBUG)
  debug('onRequestGet() called')

  debug(request.method)
  const url = new URL(request.url)
  debug(url.pathname)

  const stub = env.COUNTER.get(
    env.COUNTER.idFromName('something'),
  )
  const response = await stub.fetch('/increment')
  const count = await response.json()
  const myResponse = {
    operationNormal: true,
    count,
  }
  return jsonResponse(myResponse)
}
