import Debug from 'debug'
import { Encoder } from 'cbor-x'
import { getDebug } from '../../_utils'

const debug = getDebug('blueprint:api:experimenter')  // TODO: Change this to the name of the package. Maybe pull that from package.json.
const cborSC = new Encoder({ structuredClone: true })

function findFirstID(pathArray) {
  for (const segment of pathArray) {
    if (/^[a-fA-F0-9]{64}$$/.test(segment)) {
      return segment
    }
  }
  return null
}

export async function onRequest({ request, env, params }) {
  Debug.enable(env.DEBUG)
  debug('%s %s', request.method, request.url)

  // If there is no id in the URL, then we randomly generate one. You needn't worry that this will create orphaned durable objects
  // because if a durable object has no stored data, it ceases to exist as soon as it leaves memory.
  // So, if the call is malformed or doesn't store anything, then the orphaned durable object will be short lived.
  // Good practice is to do all of your validation and only store data once you are certain it's a valid request.
  let idString
  if (params.path) idString = findFirstID(params.path)

  let id
  if (idString) {
    id = env.COUNTER.idFromString(idString)
  } else {
    id = ['production', 'preview'].includes(env.CF_ENV) ? env.COUNTER.newUniqueId() : env.COUNTER.idFromName(crypto.randomUUID()) // TODO: newUniqueId() fails in `wrangler pages dev` maybe because I'm using old miniflare/wrangler
  }

  // build the url to be passed to the durable object
  let url = '/'
  if (params.path) url = `/${params.path.join('/')}`
  debug('url to pass to durable object: %O', url)

  const entityStub = env.COUNTER.get(id)
  const response = await entityStub.fetch(url, request)
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
