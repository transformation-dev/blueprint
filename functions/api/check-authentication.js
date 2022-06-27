import Debug from 'debug'
import { jsonResponse, getDebug } from '../_utils'

const debug = getDebug('blueprint:api:check-authentication')

export async function onRequestGet({ request, env, params }) {
  Debug.enable(env.DEBUG)
  debug('onRequestGet() called')

  // extract sessionID from cookie
  const sessionID = request.headers.get('Cookie')?.split('sessionID=')[1]?.split(';')[0]
  debug('sessionID: %s', sessionID)
  if (!sessionID) {
    return jsonResponse({ authenticated: false, message: 'No session cookie. Log in again', messageType: 'info' })
  }

  // get session from SESSIONS
  const sessionString = await env.SESSIONS.get(sessionID)  // TODO: wrap in try/catch

  // if session is not found, clear sessionID cookie
  if (!sessionString) {
    const res = jsonResponse({ authenticated: false, message: 'Session expired. Login again.', messageType: 'warning' })
    res.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
    const cookieHeaderArray = [
      'sessionID=',
      'Max-Age=0',  // This seems to be the recommended way to clear a cookie
      'SameSite=Strict',
      'path=/',
    ]
    if (env.CF_ENV === 'production' || env.CF_ENV === 'preview') {
      cookieHeaderArray.push('Secure')
      cookieHeaderArray.push('HttpOnly')
    }
    const cookieHeader = cookieHeaderArray.join('; ')
    res.headers.set('Set-Cookie', cookieHeader)
    return res
  }

  const session = JSON.parse(sessionString)
  // eslint-disable-next-line object-curly-newline
  return jsonResponse({ authenticated: true, message: 'Authentication verified', messageType: 'info', session })
}
