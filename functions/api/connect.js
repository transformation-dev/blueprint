import Debug from 'debug'
import { jsonResponse, getDebug } from '../_utils'

const debug = getDebug('blueprint:api:connect')

export async function onRequestGet({ request, env, params }) {
  Debug.enable(env.DEBUG)
  debug('onRequestGet() called')
  return jsonResponse({ success: true })
}
