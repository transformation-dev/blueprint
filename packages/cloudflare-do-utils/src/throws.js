// mono-repo imports
import Accept from '@transformation-dev/accept'  // TODO: Stop using this because only support application/cbor-sc and we don't support q values

// local imports
import { HTTPError } from './http-error.js'

const MEDIA_TYPES_SUPPORTED = ['application/cbor-sc']  // cbor-sc is my name for cbor with structuredClone extension

export function throwIf(condition, message, status = 400, body = null) {
  if (condition) {
    throw new HTTPError(message, status, body)
  }
  return true
}

export function throwUnless(condition, message, status = 400, body = null) {
  return throwIf(!condition, message, status, body)
}

export function throwIfContentTypeHeaderInvalid(request) {
  const contentType = request.headers.get('Content-Type')
  const chosenMediaType = Accept.mediaType(contentType, MEDIA_TYPES_SUPPORTED)
  throwUnless(chosenMediaType, `The Content-Type for the incoming body, ${JSON.stringify(contentType)}, is unsupported`, 415)
  return chosenMediaType
}

export function throwIfAcceptHeaderInvalid(request) {
  const accept = request.headers.get('Accept')
  const chosenMediaType = Accept.mediaType(accept, MEDIA_TYPES_SUPPORTED)
  throwUnless(chosenMediaType, `None of your supplied Accept media types, ${JSON.stringify(accept)}, are supported`, 406)
  return chosenMediaType
}

export function throwIfMediaTypeHeaderInvalid(request) {
  const contentType = throwIfContentTypeHeaderInvalid(request)
  const acceptType = throwIfAcceptHeaderInvalid(request)
  return { contentType, acceptType }
}

// Assumes that each node, including the root, is an object with an id or idString property that is a string.
// If the node also has a children property, it must be a Set of nodes, recursively.
export function throwIfNotDagUsingSets(o, currentPath = new Set()) {
  const id = o.id ?? o.idString
  throwUnless(id != null && typeof id === 'string', 'Each node, including the root, must have an id or idString property that is a string', 400)
  throwIf(o.children != null && !(o.children instanceof Set), 'If present, the children property must be a Set', 400)
  const newPath = new Set(currentPath).add(id)
  throwIf(currentPath.size === newPath.size, `Not a valid DAG. ${id} is an ancestor of itself.`, 400)
  if (o.children != null && o.children.size > 0) {
    const siblings = []
    for (const child of o.children) {
      siblings.push(child.id ?? child.idString)
      throwIfNotDagUsingSets(child, newPath)
    }
    throwUnless(new Set(siblings).size === siblings.length, `The children of ${id}, ${JSON.stringify(siblings)} contain duplicate ids`, 400)
  }
  return true
}

// Assumes that each node, including the root, is an object with an id property that is a string.
// If the node also has a children property, it must be an Array of nodes, recursively.
export function throwIfNotDag(o, currentPath = []) {  // TODO: Make this the active one once we revert tree to Arrays
  const id = o.id ?? o.idString
  throwUnless(id != null && typeof id === 'string', 'Each node, including the root, must have an id or idString property that is a string', 400)
  throwIf(o.children != null && !Array.isArray(o.children), 'If present, the children property must be an Array', 400)
  const newPath = [...currentPath, id]
  // Note, we have to do the ancestor check in the next line outside of the for loop because we need to detect a cycle as soon as possible
  // otherwise it will endlessly recurse down. I previously had an algorithm that found the leaves and then checked the ancestors of each leaf
  // and that didn't work.
  throwUnless(new Set(newPath).size === newPath.length, `Not a valid DAG. The path ${JSON.stringify(newPath)} contains duplicate ids`, 400)
  if (o.children && o.children.length > 0) {
    const siblings = []
    for (const child of o.children) {
      siblings.push(child.id ?? child.idString)
      throwIfNotDag(child, newPath)
    }
    throwUnless(new Set(siblings).size === siblings.length, `The children of ${id}, ${JSON.stringify(siblings)} contain duplicate ids`, 400)
  }
  return true
}
