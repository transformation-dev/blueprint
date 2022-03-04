import Debug from 'debug'

import version from '../../../public/version.json'

const debugRaw = Debug('blueprint:api:version/[sha]')
function debug(value) {
  console.log('\n')
  debugRaw(value)
}

export async function onRequestHead({ request, env, params }) {
  Debug.enable(env.DEBUG)
  if (params.sha === version.sha) {
    return new Response()
  } else {
    return new Response(null, { status: 400 })
  }
}
