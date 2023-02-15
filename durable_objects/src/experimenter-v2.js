// mono-repo imports
import { responseMixin, HTTPError, Debug, getDebug } from '@transformation-dev/cloudflare-do-utils'

// intialize imports
const debug = getDebug('blueprint:durable-objects:experimenter-v2')

export class ExperimenterV2 {
  async hydrate() {
    debug('hydrate()')
    if (this.hydrated) return
    this.value = await this.state.storage.get('value')
    this.twiceValue = await this.state.storage.get('twiceValue')
    this.hydrated = true
  }

  constructor(state, env) {
    Debug.enable(env.DEBUG)
    this.state = state
    this.env = env

    this.idString = this.state.id.toString()
    this.hydrated = false

    Object.assign(this, responseMixin)
  }

  async fetch(request) {
    debug('fetch()')
    debug('%s %s', request.method, request.url)
    switch (request.method) {
      case 'GET': {
        await this.hydrate()
        const value = await this.state.storage.get('value')
        const twiceValue = await this.state.storage.get('twiceValue')
        return this.getResponse({ value, twiceValue, valueInMemory: this.value, twiceValueInMemory: this.twiceValue })
      }
      case 'POST': {
        this.value = Math.random()
        this.state.storage.put('value', this.value)
        // if (Math.random() < 0.25) throw new Error('Random error thrown')
        if (Math.random() < 0.25) return this.getErrorResponse(new HTTPError('Random error response'))
        await this.state.storage.put('twiceValue', this.value * 2)
        this.twiceValue = this.value * 2
        return this.getResponse({ value: this.value, twiceValue: this.twiceValue })
      }
      default:
        return new Response('Not found', { status: 404 })
    }
  }
}
