import Debug from 'debug'
import { jsonResponse, getDebug } from '../../_utils'

const debug = getDebug('blueprint:api:passwordless-login')

export async function onRequestGet({ request, env, params }) {
  Debug.enable(env.DEBUG)
  debug('onRequestGet() called')
  debug('%O', params)

  const res = new Response(null, {
    status: 302,
    statusText: 'Redirecting',
  })
  res.headers.set('Location', '/#/')  // TODO: upgrade to using the target URL from the token request

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
  debug('cookieHeader: %O', cookieHeader)
  res.headers.set('Set-Cookie', cookieHeader)
  debug('%O', res.headers)

  return res
}
