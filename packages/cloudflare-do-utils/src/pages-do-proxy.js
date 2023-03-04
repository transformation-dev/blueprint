// TODO: Add an option for stripping out the id from the url

// local imports
import { extractBody } from './extract-body.js'
import { getDebug, Debug } from './debug.js'
import { findFirstID } from './id-string.js'

// initialize imports
const debug = getDebug('blueprint:cloudflare-do-utils:pages-do-proxy')

export function pagesDOProxy(doNameString) {
  async function onRequest({ request, env, params }) {
    Debug.enable(env.DEBUG)
    debug('%s %s', request.method, request.url)

    // If there is no id in the URL, then we randomly generate one. You needn't worry that this will create orphaned durable objects
    // because if a durable object has no stored data, it ceases to exist as soon as it leaves memory.
    // So, if the call is malformed or doesn't store anything, then the orphaned durable object will be short lived.
    // Good practice is to do all of your validation early and only store data once you are certain it's a valid request.
    let idString
    if (params.path) idString = findFirstID(params.path)

    let id
    if (idString != null) {
      id = env[doNameString].idFromString(idString)
    } else {
      // id = ['production', 'preview'].includes(env.CF_ENV) ? env[doNameString].newUniqueId() : env[doNameString].idFromName(crypto.randomUUID()) // TODO: newUniqueId() fails in `wrangler pages dev` maybe because I'm using old miniflare/wrangler
      id = env[doNameString].newUniqueId()
    }

    // build the url to be passed to the durable object
    let url = 'http://fake.host/'
    if (params.path != null && params.path.length > 0) {
      const joinedPath = params?.path?.join('/') ?? ''
      url += joinedPath
      url += request.url.slice(request.url.indexOf(joinedPath) + joinedPath.length)
    } else {
      url += request.url.slice(request.url.lastIndexOf('/') + 1)
    }
    debug('url to pass to durable object: %O', url)

    const entityStub = env[doNameString].get(id)
    const response = await entityStub.fetch(url, request)
    if (response.status >= 400) {
      debug(`${doNameString}.fetch() to %O failed with status: %O`, url, response.status)
      const body = await extractBody(response, true)
      debug('Error body:\n%O', body)
    }
    return response
  }
  return onRequest
}
