import Debug from 'debug'
import { jsonResponse, getDebug } from '../../../_utils'

const debug = getDebug('blueprint:api:passwordless-login:verify-code:[code]')

export async function onRequestGet({ request, env, params }) {
  Debug.enable(env.DEBUG)
  debug('onRequestGet() called')

  const { code } = params
  // get code from KV
  const value = JSON.parse(await env.SESSIONS.get(code))
  const email = value ? value.email : 'testing@transformation.dev'
  const { origin } = new URL(request.url)
  const targetURL = value ? value.targetURL : `${origin}/#/plan`  // TODO: Create a page just for testing if you are logged in
  const sessionID = crypto.randomUUID()
  let location
  let maxAge = '31536000'
  if (value || (env.CF_ENV !== 'production' && code === env.TESTING_OVERRIDE_CODE)) {
    const { pathname, search, hash } = new URL(targetURL)
    location = `${pathname}${search}${hash}` || '/#/'
    const DEFAULT_SESSION_TTL_DAYS = 30
    await env.SESSIONS.put(sessionID, JSON.stringify({ sessionID, email }), { expirationTtl: 60 * 60 * 24 * DEFAULT_SESSION_TTL_DAYS })  // TODO: wrap in try/catch
  } else {
    location = '/#/'
    maxAge = '0'
  }

  const res = new Response(null, {
    status: 302,
    statusText: 'Redirecting',
  })
  res.headers.set('Location', location)
  res.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')

  const cookieHeaderArray = [
    `sessionID=${sessionID}`,
    `Max-Age=${maxAge}`,
    'SameSite=Strict',  // Strict only works with SendGrid link tracking disabled
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
