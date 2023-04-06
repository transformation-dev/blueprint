import Debug from 'debug'
import { getDebug, responseOut } from '@transformation-dev/cloudflare-do-utils'

const debug = getDebug('blueprint:api:logout')

export async function onRequestGet({ request, env, params }) {
  Debug.enable(env.DEBUG)
  debug('onRequestGet() called')

  // const res = new Response(null, {
  //   status: 200,
  //   statusText: 'Logged out',
  // })

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
  const headers = {
    'Set-Cookie': cookieHeader,
    'Cache-Control': 'no-cache, no-store, must-revalidate',
  }

  return responseOut({ authenticated: false }, undefined, 'application/json', headers)
}
