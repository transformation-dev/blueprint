import Debug from 'debug'
import { jsonResponse, getDebug, verifyCode } from '../../../_utils'

const debug = getDebug('blueprint:api:passwordless-login:verify-code:[code]')

export async function onRequestGet({ request, env, params }) {
  Debug.enable(env.DEBUG)
  debug('onRequestGet() called')

  const { code } = params
  const { cookieHeader, success, location } = await verifyCode({ env, code, targetURL: request.url.href })

  // Returning a redirect regardless of success or failure
  const res = new Response(null, {
    status: 302,
    statusText: 'Redirecting',
  })

  res.headers.set('Location', location)
  res.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
  res.headers.set('Set-Cookie', cookieHeader)

  return res
}
