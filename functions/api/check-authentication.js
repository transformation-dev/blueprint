import Debug from 'debug'
import { jsonResponse, getDebug, getSecureRandomCode } from '../_utils'

const debug = getDebug('blueprint:api:check-authentication')

export async function onRequestGet({ request, env, params }) {
  Debug.enable(env.DEBUG)
  debug('onRequestGet() called')

  // extract sessionID from cookie
  debug(request)
  const sessionID = request.headers.get('Cookie')?.split('sessionID=')[1].split(';')[0]
  debug('sessionID: %s', sessionID)
  // TODO: May need some nullish coalescing in above line
  if (!sessionID) {
    // TODO: Clear sessionID cookie
    return jsonResponse({ authenticated: false, error: 'Missing sessionID cookie' })
  }

  // get session from SESSIONS
  const sessionString = await env.SESSIONS.get(sessionID)  // TODO: wrap in try/catch
  if (!sessionString) {
    // TODO: clear sessionID cookie
    return jsonResponse({ authenticated: false, error: 'Expired sessionID' })
  }
  const session = JSON.parse(sessionString)

  return jsonResponse({ authenticated: true, session })
}
