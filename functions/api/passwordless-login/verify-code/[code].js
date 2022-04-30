import Debug from 'debug'
import { jsonResponse, getDebug } from '../../../_utils'

const debug = getDebug('blueprint:api:passwordless-login:verify-code:[code]')

export async function onRequestGet({ request, env, params }) {
  Debug.enable(env.DEBUG)
  debug('onRequestGet() called')

  const { code } = params
  // get code from KV
  const value = JSON.parse(await env.SESSIONS.get(code))
  debug('value: %O', value)
  const email = value ? value.email : ''
  const targetURL = value ? value.targetURL : ''
  const { pathname, search, hash } = new URL(targetURL)
  const location = `${pathname}${search}${hash}` || '/#/'

  debug('email: %s', email)
  debug('targetURL: %s', targetURL)

  if (!email) {
    return jsonResponse({ error: 'Invalid code' })
  }

  // if no value in KV, add error query parameter to URL and redirect but clear the sessionID in the cookie

  // else, put sessionID in KV and return with it in cookie

  const res = new Response(null, {
    status: 302,
    statusText: 'Redirecting',
  })
  res.headers.set('Location', location)
  res.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')

  const sessionID = crypto.randomUUID()
  const cookieHeaderArray = [
    `sessionID=${sessionID}`,
    'Max-Age=31536000',
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
