function isQuasiBaseType(value) {
  return value instanceof Function || value instanceof Date || value instanceof RegExp || value instanceof String || value instanceof Number || value instanceof Boolean
}

function isLikelyPlainObject(value) {
  return typeof value === 'object' && value !== null && !isQuasiBaseType(value)
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
        if (isLikelyPlainObject(diff[key])) {
          if (Object.keys(diff[key]).length === 0) {
            lhs[key] = {}
          } else {
            lhs[key] = innerApplyDiff(lhs[key] ?? {}, diff[key])
          }
        } else if (diff[key] === undefined) {
          if (lhs instanceof Array) {
            // @ts-ignore
            lhs.splice(key, 1)
          } else {
            delete lhs[key]
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

// using rhs for the object to be modified to be consistent with deep-object-diff
// Example usage:
//     import { diff } from 'deep-object-diff'
//     const d = diff(lhs, rhs)
//     const restoredLHS = applyDiff(rhs, d)
//     expect(restoredLHS).to.deep.equal(lhs)
export function applyDiff(lhs, diff) {
  if (lhs?.prototype != null) Object.freeze(lhs.prototype)  // This doesn't seem to hurt, but I'm not sure if it is necessary to prevent prototype pollution
  return innerApplyDiff(lhs, diff)
}
