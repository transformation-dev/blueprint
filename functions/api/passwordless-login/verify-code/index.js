import Debug from 'debug'
import { jsonResponse, getDebug, verifyCode } from '../../../_utils'

const debug = getDebug('blueprint:api:passwordless-login:verify-code')

export async function onRequestPost({ request, env, params }) {
  Debug.enable(env.DEBUG)
  debug('onRequestPost() called')
  const { code, targetURL } = await request.json()
  const { cookieHeader, success, location } = await verifyCode({ env, code, targetURL })
  debug('got results back from verifyCode(): %O', { cookieHeader, success, location })

  const res = new Response(JSON.stringify({ success, location }), {
    status: 200,
    statusText: 'OK',
  })

  res.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
  res.headers.set('Set-Cookie', cookieHeader)
  res.headers.set('Content-Type', 'application/json; charset=utf-8')

  return res
}
