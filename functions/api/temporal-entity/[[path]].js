import Debug from 'debug'
import { nanoid as nanoidNonSecure } from 'nanoid/non-secure'
// import { nanoid } from 'nanoid'

import { getDebug } from '../../_utils'

const debug = getDebug('blueprint:api:temporal-entity')

export async function onRequest({ request, env, params }) {
  Debug.enable(env.DEBUG)
  debug('onRequest() called')

  // If there is no id in the URL, then we randomly generate one. So, you might worry that this will create orphaned durable objects.
  // However, keep in mind, if a durable object has no stored data, it ceases to exist as soon as it leaves memory.
  // So, if the call is malformed or doesn't store anything, then the orphaned durable object will be short lived.
  // Good practice is to do all of your validation and only store data once you are certain it's a valid request. For instance,
  // POST is often the only method that will use the randomly generated id, so code your DO so it fails on an invalid POST before storing anything.
  // PATCH should fail before it even attempts to store anything because there is no prior value when an id is randomly generated.
  // GET should generally never try to store anything because it's a read-only operation. Etc.
  debug('request.url: %O', request.url)
  debug('params: %O', params)

  const newPathArray = []
  // first path segment is the entity type
  if (!params?.path?.[0]) {
    return new Response('Required type segment in the path is missing', { status: 404 })  // TODO: Use my errorResponse() function from durable-object/src/utils.js
  }
  const type = params.path.shift()
  newPathArray.push(type)

  // if the second path segment is not a 64 character hex string, then generate a new id
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

  // return new Response('Got here', { status: 200 })  // TODO: remove this line')

  const entityStub = env.TEMPORAL_ENTITY.get(id)
  const response = await entityStub.fetch(url, request)  // TODO: upgrade this to pass the rest along to the durable object
  if (response.status !== 200) {
    debug('DURABLE_OBJECT.fetch() to %O failed with status: %O', url, response.status)  // TODO: replace 'DURABLE_OBJECT' with the durable object's name
    const responseClone = response.clone()
    debug('response.text(): %O', await responseClone.text())
  }
  return response
}
