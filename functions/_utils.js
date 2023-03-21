import { nanoid as nanoidNonSecure } from 'nanoid/non-secure'
import { nanoid } from 'nanoid'  // TODO: Can we use webCrypto.UUID instead and remove this dependency?

import { getDebug } from '@transformation-dev/cloudflare-do-utils'

const debug = getDebug('blueprint:_utils')  // TODO: Confirm that this works without calling Debug.enable()

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
