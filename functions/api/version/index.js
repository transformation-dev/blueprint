import {jsonResponse} from "../_utils.js"
import Debug from "debug"
const debugRaw = Debug("blueprint:api:version")
function debug(value) {
  console.log('\n')
  debugRaw(value)
}

import version from "../../../public/version.json"

export async function onRequestGet({ request, env }) {
  Debug.enable(env.DEBUG)
  return jsonResponse(version)
}
