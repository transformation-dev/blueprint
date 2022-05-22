/* eslint-disable object-curly-newline */
/* eslint-disable no-mixed-operators */
/* eslint-disable operator-assignment */
/* eslint-disable no-bitwise */
import Debug from 'debug'
import { customAlphabet, nanoid } from 'nanoid/non-secure'

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

// /**
//  * License: WTFPL, CC0, ZAP (Zero For 0wned Anti-copyright Pledge), etc
//  * derived from this: https://gist.github.com/sarciszewski/88a7ed143204d17c3e42
//  */
// export const getSecureRandomInt = (min, max) => {  // min and max are inclusive
//   // let i = rval = bits = bytes = 0
//   let bits = 0
//   let bytes = 0
//   let rval = 0
//   const range = max - min
//   if (range < 1) {
//     return min
//   }
//   // Calculate Math.ceil(Math.log(range, 2)) using binary operators
//   let tmp = range
//   /**
//    * mask is a binary string of 1s that we can & (binary AND) with our random
//    * value to reduce the number of lookups
//    */
//   let mask = 1
//   while (tmp > 0) {
//     if (bits % 8 === 0) {
//       bytes++
//     }
//     bits++
//     mask = mask << 1 | 1 // 0x00001111 -> 0x00011111
//     tmp = tmp >>> 1      // 0x01000000 -> 0x00100000
//   }

//   const values = new Uint8Array(bytes)
//   do {
//     crypto.getRandomValues(values)

//     // Turn the random bytes into an integer
//     rval = 0
//     for (let i = 0; i < bytes; i++) {
//       rval |= (values[i] << (8 * i))
//     }
//     // Apply the mask
//     rval &= mask
//     // We discard random values outside of the range and try again
//     // rather than reducing by a modulo to avoid introducing bias
//     // to our random numbers.
//   } while (rval > range)

//   // We should return a value in the interval [min, max]
//   return (rval + min)
// }

// export const getSecureRandomCode = (digits) => {
//   let code = ''
//   for (let i = 0; i < digits; i++) {
//     code += getSecureRandomInt(0, 9)
//   }
//   return code
// }

export const getSecureRandomCode = (digits) => {
  const code = customAlphabet('1234567890', digits)()
  return code
}

export const verifyCode = async ({ env, code, targetURL }) => {
  debug('_utils.verifyCode() called')
  const sessionString = code ? await env.SESSIONS.get(code) : null
  let location
  let maxAge = '31536000'
  let success = true
  let sessionID = ''
  if (sessionString || (env.CF_ENV !== 'production' && code === env.TESTING_OVERRIDE_CODE)) {
    const value = JSON.parse(sessionString)
    const email = value ? value.email : 'testing@transformation.dev'
    const confirmedTargetURL = value ? value.targetURL : targetURL
    const { pathname, search, hash } = new URL(confirmedTargetURL)
    location = `${pathname}${search}${hash}` || '/#/login'
    debug('location: %s', location)
    const DEFAULT_SESSION_TTL_DAYS = 30
    sessionID = nanoid()
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
