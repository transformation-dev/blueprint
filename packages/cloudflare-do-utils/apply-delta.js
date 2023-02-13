/* eslint-disable no-param-reassign */
export function applyDelta(obj, delta) {
  for (const key of Object.keys(delta)) {
    if (delta[key] instanceof Set) {
      obj[key] = delta[key]
    } else if (delta[key] instanceof Object) {
      obj[key] = applyDelta(obj[key] ?? {}, delta[key])
    } else if (delta[key] === undefined) {
      delete obj[key]
    } else {
      obj[key] = delta[key]
    }
  }
  return obj
}
