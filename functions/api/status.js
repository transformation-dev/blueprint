import Debug from 'debug'
// import { getDebug } from '../_utils'  // TODO: Use the version in cloudflare-do-utils
import { getDebug, responseOut } from '@transformation-dev/cloudflare-do-utils'

const debug = getDebug('blueprint:api:status')

export async function onRequestGet({ request, env, params }) {
  Debug.enable(env.DEBUG)
  debug('onRequestGet() called')

  // const stub = env.DO_API.get(
  //   env.DO_API.idFromName('something'),
  // )
  // const response = await stub.fetch('http://fake.host/counter/v1/increment')
  // console.log('response', response)
  // const count = await response.json()

  const myResponse = {
    operationNormal: true,
    // count,
    // env.CF_ENV,  // BE CAREFUL NOT TO EVER COMMIT WITH JUST `env` OR WE'LL LEAK ENVIRONMENT VARIABLES
  }
  return responseOut(myResponse)
}
