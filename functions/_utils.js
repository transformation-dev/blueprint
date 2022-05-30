import Debug from 'debug'
import { nanoid as nanoidNonSecure } from 'nanoid/non-secure'
import { nanoid } from 'nanoid'
// eslint-disable-next-line import/no-unresolved
import { stringify } from '@ungap/structured-clone/json'
import Accept from '@transformation-dev/accept'

import { HTTPError } from '../src/utils'

export { HTTPError }  // Doing this so that _utils.js is the only server-side code that needs to reach outside of /functions

export const jsonResponse = (value) => new Response(JSON.stringify(value), {
  headers: { 'Content-Type': 'application/json' },
})

const MEDIA_TYPES_SUPPORTED = ['application/sc+json', 'application/json']
const MEDIA_TYPE_FOR_ERROR = 'application/json'

function returnResponse(stringifiedBody, mediaType, status) {
  return new Response(
    stringifiedBody,
    {
      headers: {
        'Content-Type': mediaType,
        'Content-Encoding': 'gzip',  // Causes response to be gzipped by Cloudflare Workers: https://community.cloudflare.com/t/worker-doesnt-return-gzip-brotli-compressed-data/337644/3
        // 'Content-Encoding': 'br',  // TODO: Upgrade this to Brotli compression once Cloudflare Workers support it. It's gzip only for now
      },
      status: status || 200,
    },
  )
}

function stringifyBody(body, mediaType) {
  if (mediaType === 'application/sc+json') {
    return stringify(body)
  }
  return JSON.stringify(body)
}

export const negotiatedResponse = (body, request, supported = MEDIA_TYPES_SUPPORTED) => {  // supported is like @hapi/accept preferences but errors if chosen type is in the supported list
  // Use my fork of @hapi/accept to decide on the best content-type to use for the response
  const mediaType = Accept.mediaType(request.headers.get('accept'), supported)
  const mediaTypeIfError = MEDIA_TYPE_FOR_ERROR

  if (body instanceof Error) {
    const stringifiedBody = stringifyBody(body, mediaTypeIfError)
    return returnResponse(stringifiedBody, mediaTypeIfError, body.statusCode || body.status || 500)
  }

  if (!MEDIA_TYPES_SUPPORTED.includes(mediaType)) {
    let message = `No acceptable Content-Type. Supported: ${JSON.stringify(supported)}`
    if (supported.length === 1 && supported[0] === 'application/sc+json') {
      message += '. See: https://github.com/ungap/structured-clone#tojson'
    }
    return returnResponse(message, mediaTypeIfError, 406)
  }

  return returnResponse(stringifyBody(body, mediaType), mediaType)
}

export const getDebug = (name, delay = 50) => {
  const debugRaw = Debug(name)
  let quiescent = true
  let theTimeout
  const theFunction = function debug(...values) {
    clearTimeout(theTimeout)
    theTimeout = setTimeout(() => {
      quiescent = true
    }, delay)
    if (quiescent) {
      // eslint-disable-next-line no-console
      console.error('')
      quiescent = false
    }
    debugRaw(...values)
  }
  return theFunction
}

const debug = getDebug('blueprint:_utils')

export const verifyCode = async ({ env, code, targetURL }) => {
  debug('_utils.verifyCode() called')
  if (
    env.CF_ENV !== 'production'
    && (
      typeof env.TESTING_OVERRIDE_CODE !== 'string'
      || env.TESTING_OVERRIDE_CODE.length === 0
    )
  ) {
    throw new Error('*** ERROR!!! TESTING_OVERRIDE_CODE is expected in non-production environments for testing ***')
  }
  const sessionString = code ? await env.SESSIONS.get(code) : null
  let location
  let maxAge = '31536000'
  let success = true
  let sessionID = ''
  if (sessionString || (env.CF_ENV !== 'production' && code === env.TESTING_OVERRIDE_CODE && code?.length > 0)) {
    const value = JSON.parse(sessionString)
    const email = value ? value.email : 'testing@transformation.dev'
    const confirmedTargetURL = value ? value.targetURL : targetURL
    const { pathname, search, hash } = new URL(confirmedTargetURL)
    location = `${pathname}${search}${hash}` || '/#/login'
    debug('location: %s', location)
    const DEFAULT_SESSION_TTL_DAYS = 30
    if (env.CF_ENV === 'production') {
      sessionID = nanoid()
    } else {
      sessionID = nanoidNonSecure()
    }
    await env.SESSIONS.put(sessionID, JSON.stringify({ sessionID, email }), { expirationTtl: 60 * 60 * 24 * DEFAULT_SESSION_TTL_DAYS })  // TODO: wrap in try/catch
    success = true
  } else {
    location = '/#/login'
    maxAge = '0'
    success = false
  }

  const cookieHeaderArray = [
    `sessionID=${sessionID}`,
    `Max-Age=${maxAge}`,
    'SameSite=Strict',  // Strict only works with SendGrid link tracking disabled
    'path=/',
  ]
  if (env.CF_ENV === 'production' || env.CF_ENV === 'preview') {
    cookieHeaderArray.push('Secure')
    cookieHeaderArray.push('HttpOnly')
  }
  const cookieHeader = cookieHeaderArray.join('; ')

  debug('About to return from _utils.verifyCode(). returning: %O', { location, cookieHeader, success })

  return { cookieHeader, success, location }
}
