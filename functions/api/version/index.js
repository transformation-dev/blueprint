import Debug from 'debug'
import { getDebug, responseOut } from '@transformation-dev/cloudflare-do-utils'
import version from '../../../public/version.json'

const debug = getDebug('blueprint:api:version')

export async function onRequestGet({ request, env, params }) {
  Debug.enable(env.DEBUG)
  debug('onRequestGet() called')
  return responseOut(version, undefined, 'application/json')
}
