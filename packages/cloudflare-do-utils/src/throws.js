// mono-repo imports
import Accept from '@transformation-dev/accept'  // TODO: Stop using this because only support application/cbor-sc and we don't support q values

// local imports
import { HTTPError } from './http-error.js'

const MEDIA_TYPES_SUPPORTED = ['application/cbor-sc']  // cbor-sc is my name for cbor with structuredClone extension

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
