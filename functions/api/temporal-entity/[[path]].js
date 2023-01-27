import Debug from 'debug'
import { Encoder } from 'cbor-x'
import { getDebug } from '../../_utils'

const debug = getDebug('blueprint:api:temporal-entity')
const cborSC = new Encoder({ structuredClone: true })

function findFirstID(pathArray) {  // TODO: Get this from utils.js once we move TemporalEntityBase to it's own project
  for (const segment of pathArray) {
    if (/^[a-fA-F0-9]{64}$$/.test(segment)) {
      return segment
    }
  }
  return null
}

export async function onRequest({ request, env, params }) {
  Debug.enable(env.DEBUG)
  debug('onRequest() called')
  debug('%s %s', request.method, request.url)

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

  const idString = findFirstID(params.path)

  let id
  if (idString) {
    id = env.TEMPORAL_ENTITY.idFromString(idString)
  } else {
    id = ['production', 'preview'].includes(env.CF_ENV) ? env.TEMPORAL_ENTITY.newUniqueId() : env.TEMPORAL_ENTITY.idFromName(crypto.randomUUID()) // TODO: newUniqueId() fails in `wrangler pages dev` maybe because I'm using old miniflare/wrangler
  }

  // build the url to be passed to the durable object
  const url = `/${params.path.join('/')}`
  debug('url to pass to durable object: %O', url)

  const entityStub = env.TEMPORAL_ENTITY.get(id)
  const response = await entityStub.fetch(url, request)  // TODO: upgrade this to pass the rest along to the durable object
  if (response.status >= 400) {
    debug('DURABLE_OBJECT.fetch() to %O failed with status: %O', url, response.status)  // TODO: replace 'DURABLE_OBJECT' with the durable object's name
    const responseClone = response.clone()
    if (responseClone.headers.get('Content-Type') === 'application/cbor-sc') {
      const ab = await responseClone.arrayBuffer()
      if (ab) {
        const u8a = new Uint8Array(ab)
        const o = cborSC.decode(u8a)
        debug('Error body:\n%O', o)
      }
    } else if (responseClone.headers.get('Content-Type') === 'application/json') {
      debug('Error body:\n%O', await responseClone.text())
    }
  }
  return response
}
