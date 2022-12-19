import Debug from 'debug'
import { nanoid as nanoidNonSecure } from 'nanoid/non-secure'
import { nanoid } from 'nanoid'

import { getDebug } from '../../_utils'

const debug = getDebug('blueprint:api:temporal-entity')

export async function onRequest({ request, env, params }) {
  Debug.enable(env.DEBUG)
  debug('onRequest() called')

  if (params?.id?.length > 1) {
    // TODO: upgrade this to pass the rest along to the durable object
    return new Response('error')
  }


  // TODO: Figure out why below doesn't work. Could be because I'm using old miniflare/wrangler. Fails on call to newUniqueId()
  // debug(`idString: ${idString}`)
  // let id
  // if (idString) {
  //   id = env.TEMPORAL_ENTITY.idFromString(idString)
  // } else {
  //   console.log('got here')
  //   id = env.TEMPORAL_ENTITY.newUniqueId()
  //   console.log('and here')
  //   idString = id.toString()
  //   console.log('and finally here')
  // }
  // debug(`id: ${id}`)
  // debug(`idString: ${idString}`)
  // const entityStub = env.TEMPORAL_ENTITY.get(id)


  // I don't need to worry about GET and PATCH calls with randomly generated ids leaving orphaned DOs that hang
  // around forever because as long as the durable object has no stored data, it ceases to exist as soon as it leaves memory
  let id = params?.id?.[0]
  id ??= env.CF_ENV === 'production' ? nanoid() : nanoidNonSecure()
  const entityStub = env.TEMPORAL_ENTITY.get(env.TEMPORAL_ENTITY.idFromName(id))  // TODO: confirm there isn't a better way to get the stub when the ID is known
  const response = await entityStub.fetch('/', request)
  return response
}
