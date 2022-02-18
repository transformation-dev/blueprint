import Debug from "debug"
const debug = Debug("blueprint:api:status")

export async function onRequestGet({ request, env }) {
  Debug.enable(env.DEBUG)
  debug(env)
  return new Response(`All systems operational\n\n` + JSON.stringify(env, null, 2))
}
