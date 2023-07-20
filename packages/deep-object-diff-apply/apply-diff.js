/**
 * applyDiff(lhs, diff) applies the diff to lhs and restores the rhs originally used to create the diff
 * @param lhs - the object to be modified
 * @param diff - the diff to apply to lhs
 *
 * This function has side effects because it modifies lhs in place.
 */

function isQuasiPrimative(value) {
  return value instanceof Function || value instanceof Date || value instanceof RegExp || value instanceof String || value instanceof Number || value instanceof Boolean
}

// using a single-value cache to avoid re-calculating this twice when we descend into an object
let lastValue
let lastResult
function isLikelyPlainObject(value) {
  if (value === lastValue) return lastResult
  lastValue = value
  lastResult = typeof value === 'object' && value !== null && !isQuasiPrimative(value)
  return lastResult
}

/* eslint-disable no-param-reassign */
function innerApplyDiff(lhs, diff) {
  let keys
  if (isLikelyPlainObject(diff)) {
    keys = Object.keys(diff)
    if (keys.length === 0) {
      return lhs
    } else if (isLikelyPlainObject(lhs)) {
      for (const key of keys) {
        if (diff[key] === undefined) {
          if (lhs instanceof Array) {
            // @ts-ignore
            lhs.splice(key, 1)
          } else {
            delete lhs[key]
          }
        } else if (isLikelyPlainObject(diff[key])) {
          if (Object.keys(diff[key]).length === 0) {
            lhs[key] = {}
          } else {
            lhs[key] = innerApplyDiff(lhs[key] ?? {}, diff[key])
          }
        } else {
          lhs[key] = diff[key]
        }
      }
    } else {
      lhs = diff
    }
  } else {
    lhs = diff
  }
  return lhs
}

export function applyDiff(lhs, diff) {
  if (lhs?.prototype != null) Object.freeze(lhs.prototype)  // This doesn't seem to hurt, but I'm not sure if it is necessary to prevent prototype pollution
  return innerApplyDiff(lhs, diff)
}
