import Debug from "debug"
const debug = Debug("blueprint:api:connect")

export async function onRequestGet(request) {
  Debug.enable(request.env.DEBUG)
  debug(request)
  return new Response(`All systems operational`)
}