// mono-repo imports
import { responseMixin, Debug, getDebug } from '@transformation-dev/cloudflare-do-utils'

// intialize imports
const debug = getDebug('blueprint:durable-objects:experimenter-v2')

export class ExperimenterV2 {
  async hydrate() {
    if (this.hydrated) return
    this.name = await this.state.storage.get('name')
    this.greeting = await this.state.storage.get('greeting')
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

    await this.hydrate()

    const url = new URL(request.url)
    if (url.search === '') {
      return this.getResponse({ name: this.name, greeting: this.greeting })
    } else {
      this.name = url.searchParams.get('name')
      this.state.storage.put('name', this.name)
      this.greeting = `HELLO ${this.name.toUpperCase()}!`
      this.state.storage.put('greeting', this.greeting)
      return this.getResponse({ name: this.name, greeting: this.greeting })
    }
  }
}
