/* eslint-disable object-curly-newline */
/* eslint-disable no-mixed-operators */
/* eslint-disable operator-assignment */
/* eslint-disable no-bitwise */
import Debug from 'debug'
import { nanoid as nanoidNonSecure } from 'nanoid/non-secure'
import { nanoid } from 'nanoid'

export const jsonResponse = (value) => new Response(JSON.stringify(value), {
  headers: { 'Content-Type': 'application/json' },
})

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
  const sessionString = code ? await env.SESSIONS.get(code) : null
  let location
  let maxAge = '31536000'
  let success = true
  let sessionID = ''
  if (code?.length === 6 && (sessionString || (env.CF_ENV !== 'production' && code === env.TESTING_OVERRIDE_CODE))) {
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
