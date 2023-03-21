import Debug from 'debug'
import { getDebug } from '@transformation-dev/cloudflare-do-utils'
import version from '../../../public/version.json'

const debug = getDebug('blueprint:api:version/[sha]')

export async function onRequestHead({ request, env, params }) {
  Debug.enable(env.DEBUG)
  debug('onRequestHead() called')
  if (params.sha === version.sha) {
    return new Response()
  } else {
    return new Response(null, { status: 400 })
  }
}
