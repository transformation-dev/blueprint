import Debug from 'debug'
import { jsonResponse, getDebug } from '../_utils'
import version from '../../../public/version.json'

const debug = getDebug('blueprint:api:version')

export async function onRequestGet({ request, env }) {
  Debug.enable(env.DEBUG)
  debug('onRequestGet() called')
  return jsonResponse(version)
}
