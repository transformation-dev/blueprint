import Debug from 'debug'
import { getDebug } from '@transformation-dev/cloudflare-do-utils'
import { verifyCode } from '../../../_utils'

const debug = getDebug('blueprint:api:passwordless-login:verify-code:[code]')

export async function onRequestGet({ request, env, params }) {
  Debug.enable(env.DEBUG)
  debug('onRequestGet() called')

  const { code } = params
  const { cookieHeader, success, location } = await verifyCode({ env, code, targetURL: request.url.href })

  // Returning a redirect regardless, success redirects to target and failure redirects to login page
  const res = new Response(null, {  // TODO: Use responseOut
    status: 302,
    statusText: 'Redirecting',
  })

  res.headers.set('Location', location)
  res.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
  res.headers.set('Set-Cookie', cookieHeader)

  return res
}
