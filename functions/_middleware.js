/* eslint-disable prefer-const */
import Debug from 'debug'
import { getDebug } from './_utils'

const debug = getDebug('blueprint:_middleware')

async function csp({
  request, env, next,
}) {
  Debug.enable(env.DEBUG)
  const url = new URL(request.url)
  if (url.pathname === '/' || url.pathname === '/index.html') {
    const nonce = crypto.randomUUID()

    const CSPheaderArray = [
      `script-src 'self' 'nonce-${nonce} 'strict-dynamic';`,
      "object-src 'none';",
      "base-uri 'none';",
    ]

    if (env.CF_ENV === 'production' || env.CF_ENV === 'preview') {
      CSPheaderArray.push('upgrade-insecure-requests;')
    }

    const CSPheader = CSPheaderArray.join(' ')

    // const res = await env.ASSETS.fetch(`${url.origin}/index.html`)
    const res = await next()
    const theBody = await res.text()

    const html = theBody
      .replace(/4ce3a419-321c-4f39-b926-af6776a4b68f/gi, nonce)
      .replace(
        'src="https://ajax.cloudflare.com',
        `nonce="${nonce}" src="https://ajax.cloudflare.com`,
      )
      .replace(
        'src="https://static.cloudflareinsights.com',
        `nonce="${nonce}" src="https://static.cloudflareinsights.com`,
      )
      .replace(
        'cloudflare-static/email-decode.min.js"',
        `cloudflare-static/email-decode.min.js" nonce="${nonce}"`,
      )

    const newRes = new Response(html, {
      status: res.status,
      statusText: res.statusText,
    })

    // eslint-disable-next-line no-restricted-syntax
    for (const [key, value] of res.headers) {
      if (!(key.toLowerCase() === 'access-control-allow-origin')) {
        newRes.headers.set(key, value)
      }
    }

    newRes.headers.set('content-security-policy', CSPheader)
    newRes.headers.set('content-type', 'text/html')
    // TODO: move the below to apply to all appropriate responses instead of just index.html
    newRes.headers.set('X-Frame-Options', 'DENY')
    newRes.headers.set('X-Content-Type-Options', 'nosniff')
    newRes.headers.set('Referrer-Policy', 'no-referrer')
    if (env.CF_ENV === 'production' || env.CF_ENV === 'preview') {
      newRes.headers.set('Strict-Transport-Security', 'max-age=31536000')
    }
    if (env.CF_ENV === 'production') {  // Only set in production so smoke tests in cloudflare preview work
      newRes.headers.set('Permissions-Policy', 'document-domain=()')
    }

    return newRes
  }
  return next()
}

export const onRequestGet = [csp]
