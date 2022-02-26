import Debug from "debug"
const debugRaw = Debug("blueprint:api:status")
function debug(value) {
  console.log('\n')
  debugRaw(value)
}

export async function onRequestGet({ request, env }) {
  Debug.enable(env.DEBUG)

  const stub = env.COUNTER.get(
    env.COUNTER.idFromName('something')
  )
  const response = await stub.fetch('/increment')
  const count = await response.json()
  const myResponse = {
    operationNormal: true,
    count
  }
  return new Response(JSON.stringify(myResponse))
}
