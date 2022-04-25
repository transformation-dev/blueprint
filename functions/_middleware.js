/* eslint-disable prefer-const */
import Debug from 'debug'
import { jsonResponse, getDebug } from './_utils'

const debug = getDebug('blueprint:_middleware')

async function csp({
  request, env, params, next,
}) {
  Debug.enable(env.DEBUG)
  debug(env)
  const url = new URL(request.url)
  if ((env.CF_ENV === 'production' || env.CF_ENV === 'preview') && (url.pathname === '/' || url.pathname === '/index.html')) {
    debug('Rewriting index.html for CSP')
    debug(url.pathname)
    debug(url.origin)

    // const nonce = btoa(crypto.getRandomValues(new Uint32Array(2)))
    const nonce = crypto.randomUUID()
    debug(nonce)

    const CSPheader = [
      "default-src 'self';",
      `script-src 'self' 'nonce-${nonce};`,
      `style-src 'self' 'nonce-${nonce};`,
      "img-src 'self';",
      "font-src 'self';",
      "connect-src 'none';",
      "media-src 'none';",
      "object-src 'none';",
      "child-src 'none';",
      "frame-ancestors 'none';",
      "form-action 'none';",
      'upgrade-insecure-requests;',
      "manifest-src 'none';",
      "require-trusted-types-for 'script';",
    ].join(' ')

    const res = await env.ASSETS.fetch(`${url.origin}/index.html`)
    const theBody = await res.text()
    debug(theBody)

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

    // // eslint-disable-next-line no-restricted-syntax
    // for (let [header, value] of res.headers.entries()) {
    //   if (['via', 'server'].includes(header)) {
    //     // eslint-disable-next-line no-continue
    //     continue
    //   }

    //   if (
    //     [
    //       'content-security-policy',
    //       'content-security-policy-report-only',
    //     ].includes(header)
    //   ) {
    //     // Reuse previously sent Content-Security-Policy
    //     if (res.status === 304) continue
    //     value = value.replace(/4ce3a419-321c-4f39-b926-af6776a4b68f/gi, nonce)
    //   }
    //   newRes.headers.set(header, value)
    //   newRes.headers.set('cf-nonce-generator', 'HIT')
    // }

    newRes.headers.set('content-security-policy', CSPheader)
    newRes.headers.set('content-type', 'text/html')

    debug(newRes.headers)

    return newRes
  }
  return next()
}

export const onRequestGet = [csp]
