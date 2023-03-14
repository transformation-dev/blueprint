/* eslint-disable no-param-reassign */
function innerApplyDelta(obj, delta) {
  for (const key of Object.keys(delta)) {
    if (Array.isArray(delta[key]) || delta[key] instanceof Set || delta[key] instanceof Map) {
      obj[key] = delta[key]
    } else if (delta[key] instanceof Object) {
      obj[key] = innerApplyDelta(obj[key] ?? {}, delta[key])
    } else if (delta[key] === undefined) {
      delete obj[key]
    } else {
      obj[key] = delta[key]
    }
  }
  return obj
}

export function applyDelta(obj, delta) {
  Object.freeze(obj.prototype)  // This doesn't seem to hurt, but I'm not sure if it prevents prototype pollution
  return innerApplyDelta(obj, delta)
}
