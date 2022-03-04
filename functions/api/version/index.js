import Debug from 'debug'
import { jsonResponse } from '../_utils'

import version from '../../../public/version.json'

const debugRaw = Debug('blueprint:api:version')
function debug(value) {
  // eslint-disable-next-line no-console
  console.log('\n')
  debugRaw(value)
}

export async function onRequestGet({ request, env }) {
  Debug.enable(env.DEBUG)
  return jsonResponse(version)
}
