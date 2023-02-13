// local imports
import { throwIf } from './throws.js'

export const idStringRegExp = /^[a-fA-F0-9]{64}$$/

export function isIDString(s) {
  return typeof s === 'string' && idStringRegExp.test(s)
}

export function findFirstID(pathArray) {
  for (const segment of pathArray) {
    if (isIDString(segment)) {
      return segment
    }
  }
  return null
}

// eslint-disable-next-line consistent-return
export function getIDStringFromInput(input) {
  if (typeof input === 'string' || input instanceof String) return [input, input]
  if (input.idString) return [input.idString, input, input.validFrom]
  const num = Number(input)
  if (!Number.isNaN(num)) {
    const idString = num.toString()
    return [idString, idString]
  }
  throwIf(true, `${input} must be a string, Number, or a TemporalEntity`)
}
