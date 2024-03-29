// mono-repo imports
import { Debug, getDebug } from '../../src/debug.js'
import { temporalMixin } from '../../src/temporal-mixin.js'

// initialize imports
const debug = getDebug('blueprint:durable-objects:experimenter-v2')

export class TransactionalTester {
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
    Object.assign(this, temporalMixin)
    this.hydrated = false
  }

  async fetch(request) {
    debug('fetch()')
    debug('%s %s', request.method, request.url)

    await this.hydrate()

    const url = new URL(request.url)
    if (url.search === '') {
      return this.doResponseOut({ name: this.name, greeting: this.greeting })
    } else {
      this.name = url.searchParams.get('name')
      this.state.storage.put('name', this.name)
      this.greeting = `HELLO ${this.name.toUpperCase()}!`
      this.state.storage.put('greeting', this.greeting)
      return this.doResponseOut({ name: this.name, greeting: this.greeting })
    }
  }
}
