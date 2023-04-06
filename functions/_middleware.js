/* eslint-disable prefer-const */
import Debug from 'debug'
import { nanoid as nanoidNonSecure } from 'nanoid/non-secure'
import { nanoid } from 'nanoid'
import { getDebug } from '@transformation-dev/cloudflare-do-utils'

const debug = getDebug('blueprint:_middleware')

async function csp({ request, env, next }) {  // TODO: split this out to its own file or maybe even an npm package
  Debug.enable(env.DEBUG)
  // debug('%O', request.headers.get('Cookie') || '')
  const url = new URL(request.url)
  if (url.pathname === '/' || url.pathname === '/index.html') {
    debug('/ or /index.html requested. Setting CSP header.')
    // const nonce = crypto.randomUUID().replace(/-/g, '')

    let nonce
    if (env.CF_ENV === 'production') {
      nonce = nanoid()
    } else {
      nonce = nanoidNonSecure()
    }

    const CSPheaderArray = [
      `script-src 'self' 'nonce-${nonce}' 'strict-dynamic';`,
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

    // TODO: upgrade this to use the HTML rewriter
    const html = theBody
      .replace(  // this is only used in vite dev mode
        '<script type="module" src="/src/main.js',
        `<script type="module" nonce="${nonce}" src="/src/main.js`,
      )
      .replace(  // also only in vite dev mode
        'src="/@vite/client"',
        `nonce="${nonce}" src="/@vite/client"`,
      )
      .replace(  // this is used in preview and production modes
        '<script type="module" crossorigin src="/assets/',
        `<script type="module" nonce="${nonce}" src="/assets/`,
      )
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

    const newRes = new Response(html, {  // Not using responseOut because it's HTML, not an API call
      status: res.status,
      statusText: res.statusText,
    })

    const ignoreTheseHeaders = [
      'access-control-allow-origin',
      'content-length',
    ]
    // eslint-disable-next-line no-restricted-syntax
    for (const [key, value] of res.headers) {
      if (!ignoreTheseHeaders.includes(key.toLowerCase())) {
        newRes.headers.set(key, value)
      }
    }

    newRes.headers.set('content-security-policy', CSPheader)
    newRes.headers.set('content-type', 'text/html; charset=utf-8')
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
    newRes.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')

    return newRes
  }
  return next()
}

export const onRequestGet = [csp]  // TODO: Switch this to onRequest and check for request.method === 'GET' in the csp function
