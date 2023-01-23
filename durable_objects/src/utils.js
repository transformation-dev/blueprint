// 3rd party imports
import { Encoder } from 'cbor-x'
import Debug from 'debug'

// mono-repo imports
import Accept from '@transformation-dev/accept'

// iniialize imports
const cborSC = new Encoder({ structuredClone: true })

const MEDIA_TYPES_SUPPORTED = ['application/cbor-sc']  // cbor-sc is my name for cbor with structuredClone extension

export class HTTPError extends Error {
  constructor(message, status, body) {
    super(message)
    this.status = status
    if (body) {
      if (typeof body === 'object') {
        this.body = structuredClone(body)  // TODO: C - Consider not cloning in production or preview
        this.body.error = { message, status }
      } else {
        this.body = body
      }
    } else {
      this.body = { error: { message, status } }
    }
  }
}

export function throwIf(condition, message, status = 400, body = null) {
  if (condition) {
    throw new HTTPError(message, status, body)
  }
}

export function throwUnless(condition, message, status = 400, body = null) {
  throwIf(!condition, message, status, body)
}

export function throwIfContentTypeHeaderInvalid(request) {
  const contentType = request.headers.get('Content-Type')
  const mediaType = Accept.mediaType(contentType, MEDIA_TYPES_SUPPORTED)
  throwUnless(mediaType, `The Content-Type for the incoming body, ${JSON.stringify(contentType)}, is unsupported`, 415)
}

export function throwIfAcceptHeaderInvalid(request) {
  const accept = request.headers.get('Accept')
  const mediaType = Accept.mediaType(accept, MEDIA_TYPES_SUPPORTED)
  throwUnless(mediaType, `None of your supplied Accept media types, ${JSON.stringify(accept)}, are supported`, 406)
}

export function throwIfMediaTypeHeaderInvalid(request) {
  throwIfContentTypeHeaderInvalid(request)
  throwIfAcceptHeaderInvalid(request)
}

export async function decodeCBORSC(request) {
  try {
    const ab = await request.arrayBuffer()
    const u8a = new Uint8Array(ab)
    const o = cborSC.decode(u8a)
    return o
  } catch (e) {
    throw new HTTPError('Error decoding your supplied body. Encode with npm package cbor-x using structured clone extension.', 415)
  }
}

// Assumes that each node, including the root, is an object with an id property that is a string.
// If the node also has a children property, it must be an array of nodes, recursively.
export function throwIfNotDag(o, currentPath = []) {
  throwUnless(o.id && typeof o.id === 'string', 'Each node, including the root, must have an id property that is a string', 400)
  throwIf(o.children && !Array.isArray(o.children), 'If present, the children property must be an array', 400)
  const newPath = [...currentPath, o.id]
  // Note, we have to do the ancestor check in the next line outside of the for loop because we need to detect a cycle as soon as possible
  // otherwise it will endlessly recurse down. I previously had an algorithm that found the leaves and then checked the ancestors of each leaf
  // and that didn't work.
  throwUnless(new Set(newPath).size === newPath.length, `Not a valid DAG. The path ${JSON.stringify(newPath)} contains duplicate ids`, 400)
  if (o.children && o.children.length > 0) {
    const siblings = []
    for (const child of o.children) {
      siblings.push(child.id)
      throwIfNotDag(child, newPath)
    }
    throwUnless(new Set(siblings).size === siblings.length, `The children of ${o.id}, ${JSON.stringify(siblings)} contain duplicate ids`, 400)
  }
}

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

export function apply(obj, d) {
  for (const key of Object.keys(d)) {
    if (d[key] instanceof Object) {
      // eslint-disable-next-line no-param-reassign
      obj[key] = apply(obj[key] ?? {}, d[key])
    } else if (d[key] === undefined) {
      // eslint-disable-next-line no-param-reassign
      delete obj[key]
    } else {
      // eslint-disable-next-line no-param-reassign
      obj[key] = d[key]
    }
  }
  return obj
}

export function extractETag(request) {
  let eTag = request.headers.get('If-Match')
  if (!eTag) eTag = request.headers.get('If-None-Match')
  if (eTag === 'undefined' || eTag === 'null') return undefined
  return eTag
}

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
