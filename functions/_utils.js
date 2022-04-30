/* eslint-disable no-mixed-operators */
/* eslint-disable operator-assignment */
/* eslint-disable no-bitwise */
import Debug from 'debug'

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

/**
 * License: WTFPL, CC0, ZAP (Zero For 0wned Anti-copyright Pledge), etc
 * derived from this: https://gist.github.com/sarciszewski/88a7ed143204d17c3e42
 */
export const getSecureRandomInt = (min, max) => {  // min and max are inclusive
  // let i = rval = bits = bytes = 0
  let bits = 0
  let bytes = 0
  let rval = 0
  const range = max - min
  if (range < 1) {
    return min
  }
  // Calculate Math.ceil(Math.log(range, 2)) using binary operators
  let tmp = range
  /**
   * mask is a binary string of 1s that we can & (binary AND) with our random
   * value to reduce the number of lookups
   */
  let mask = 1
  while (tmp > 0) {
    if (bits % 8 === 0) {
      bytes++
    }
    bits++
    mask = mask << 1 | 1 // 0x00001111 -> 0x00011111
    tmp = tmp >>> 1      // 0x01000000 -> 0x00100000
  }

  const values = new Uint8Array(bytes)
  do {
    crypto.getRandomValues(values)

    // Turn the random bytes into an integer
    rval = 0
    for (let i = 0; i < bytes; i++) {
      rval |= (values[i] << (8 * i))
    }
    // Apply the mask
    rval &= mask
    // We discard random values outside of the range and try again
    // rather than reducing by a modulo to avoid introducing bias
    // to our random numbers.
  } while (rval > range)

  // We should return a value in the interval [min, max]
  return (rval + min)
}

export const getSecureRandomCode = (digits) => {
  let code = ''
  for (let i = 0; i < digits; i++) {
    code += getSecureRandomInt(0, 9)
  }
  return code
}
