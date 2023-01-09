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
  const idString = params?.path?.[0]
  let id
  let url
  if (idString) {
    debug(`idString: ${idString}`)
    id = env.TEMPORAL_ENTITY.idFromString(idString)
    const loc = request.url.indexOf(idString)
    url = request.url.slice(loc + idString.length)
    debug('url: %O', url)
    // if second path segment is a 64 character hex string, then the first segment is a type
    // const newPathArray = []
    // for (const segment of params.path) {
    //   if (/[a-zA-Z0-9]{64}/.test(segment)) {

    //     newPathArray.push(segment)
    //   console.log(segment)
    // }
    // const altUrl = params.path.join('/')
    // debug('altUrl: %O', altUrl)
    // if (url !== altUrl) throw new Error(`url: ${url} !== altUrl: ${altUrl}`)
    if (url === '') url = '/'
  } else {
    id = ['production', 'preview'].includes(env.CF_ENV) ? env.TEMPORAL_ENTITY.newUniqueId() : env.TEMPORAL_ENTITY.idFromName(nanoidNonSecure()) // TODO: newUniqueId() fails in `wrangler pages dev` maybe because I'm using old miniflare/wrangler
    url = '/'
  }

  const entityStub = env.TEMPORAL_ENTITY.get(id)
  const response = await entityStub.fetch(url, request)  // TODO: upgrade this to pass the rest along to the durable object
  if (response.status !== 200) {
    debug('DURABLE_OBJECT.fetch() to %O failed with status: %O', url, response.status)  // TODO: replace 'DURABLE_OBJECT' with the durable object's name
    const responseClone = response.clone()
    debug('response.text(): %O', await responseClone.text())
  }
  return response
}
