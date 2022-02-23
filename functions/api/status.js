import Debug from "debug"
const debugRaw = Debug("blueprint:api:status")
function debug(value) {
  console.log('\n')
  debugRaw(value)
}

export async function onRequestGet({ request, env }) {
  Debug.enable(env.DEBUG)
  const fileResponse = await env.ASSETS.fetch(new URL(request.url).origin + "/favicon.png")
  debug(fileResponse)

  const stub = env.COUNTER.get(
    env.COUNTER.idFromName('something')
  )
  // debug(stub)
  const response = await stub.fetch('/increment')
  const count = await response.json()
  debug(count)
  // return new Response('All systems operational\n\n' + JSON.stringify(env, null, 2))
  return new Response('All systems operational')
}
