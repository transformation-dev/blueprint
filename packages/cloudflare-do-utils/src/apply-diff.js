/* eslint-disable no-param-reassign */
function innerApplyDiff(lhs, diff) {
  if (diff instanceof Object) {
    if (diff instanceof Function || diff instanceof Date || diff instanceof RegExp || diff instanceof String || diff instanceof Number || diff instanceof Boolean) {
      lhs = diff
      return lhs
    }
    const keys = Object.keys(diff)
    if (keys.length === 0) return lhs
  }
  if (lhs instanceof Object) {
    const keys = Object.keys(diff)
    if (keys.length > 0) {
      for (const key of keys) {
        if (diff[key] instanceof Object) {
          if (Object.keys(diff[key]).length === 0) lhs[key] = {}
          else lhs[key] = innerApplyDiff(lhs[key] ?? {}, diff[key])
        } else if (diff[key] === undefined) {
          delete lhs[key]
        } else {
          lhs[key] = diff[key]
        }
      }
    } else {
      lhs = diff
    }
  } else if (!(lhs instanceof Object)) {
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
  // if (lhs == null) return diff
  // Object.freeze(lhs.prototype)  // This doesn't seem to hurt, but I'm not sure if it is necessary to prevent prototype pollution
  return innerApplyDiff(lhs, diff)
}
