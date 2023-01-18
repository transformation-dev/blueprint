import Debug from 'debug'
import { nanoid as nanoidNonSecure } from 'nanoid/non-secure'  // TODO: Consider switching to Crypto.randomUUID() if it's available in Cloudflare
// import { customAlphabet } from 'nanoid/non-secure'
// import { nanoid } from 'nanoid'

import { getDebug } from '../../_utils'

const debug = getDebug('blueprint:api:temporal-entity')
// const nanoidNonSecure = customAlphabet('1234567890abcdef', 64) // to mimick durable object id.toString()

export async function onRequest({ request, env, params }) {
  Debug.enable(env.DEBUG)
  debug('onRequest() called')

  // If there is no id in the URL, then we randomly generate one. You needn't worry that this will create orphaned durable objects
  // because if a durable object has no stored data, it ceases to exist as soon as it leaves memory.
  // So, if the call is malformed or doesn't store anything, then the orphaned durable object will be short lived.
  // Good practice is to do all of your validation and only store data once you are certain it's a valid request.
  debug('request.url: %O', request.url)
  debug('params: %O', params)

  // TODO: make the below code more generic. Make no assumptions about the path. Simply search for the first segment that matches
  //       the idString regex. If there is no match, then generate a new id. If there is a match, then use that id.
  //       regardless of the position in the path of the idString, pass the entire path to the durable object. This will
  //       require a change to the durable object code. It'll have to do the same sort of searching for the idString.
  //       It'll also have to be able to handle paths that have no idString because we won't add that to the path.

  const newPathArray = []

  const type = params.path.shift()
  newPathArray.push(type)

  // if the next path segment is not a 64 character hex string, then generate a new id
  const idString = params.path.shift()
  let id
  if (idString && /^[a-fA-F0-9]{64}$$/.test(idString)) {  // second path segment is a 64 character hex string
    id = env.TEMPORAL_ENTITY.idFromString(idString)
    newPathArray.push(idString)
  } else {
    id = ['production', 'preview'].includes(env.CF_ENV) ? env.TEMPORAL_ENTITY.newUniqueId() : env.TEMPORAL_ENTITY.idFromName(nanoidNonSecure()) // TODO: newUniqueId() fails in `wrangler pages dev` maybe because I'm using old miniflare/wrangler
    newPathArray.push(id.toString())
    if (idString) newPathArray.push(idString)  // push the non-hex string onto newPathArray as the third segment
  }

  // concatenate any remaining path segments to the newPathArray
  newPathArray.push(...params.path)

  // build the url to be passed to the durable object
  const url = newPathArray.join('/')
  debug('url to pass to durable object: %O', url)

  const entityStub = env.TEMPORAL_ENTITY.get(id)
  const response = await entityStub.fetch(url, request)  // TODO: upgrade this to pass the rest along to the durable object
  if (response.status !== 200) {
    debug('DURABLE_OBJECT.fetch() to %O failed with status: %O', url, response.status)  // TODO: replace 'DURABLE_OBJECT' with the durable object's name
    const responseClone = response.clone()
    debug('response.text(): %O', await responseClone.text())  // TODO: CBOR decode the response body if the Content-Type is application/cbor or cbor-sc
  }
  return response
}
