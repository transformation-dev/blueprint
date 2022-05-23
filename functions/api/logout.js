import Debug from 'debug'
import { jsonResponse, getDebug } from '../_utils'

const debug = getDebug('blueprint:api:logout')

export async function onRequestGet({ request, env, params }) {
  Debug.enable(env.DEBUG)
  debug('onRequestGet() called')

  // const res = new Response(null, {
  //   status: 200,
  //   statusText: 'Logged out',
  // })

  const res = jsonResponse({ authenticated: false })

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
