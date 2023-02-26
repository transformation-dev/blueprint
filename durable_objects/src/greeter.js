// mono-repo imports
import { TransactionalDOWrapperBase } from '@transformation-dev/cloudflare-do-utils'

export class OriginalGreeter {
  async hydrate() {
    if (this.hydrated) return
    this.name = await this.state.storage.get('name')
    this.greeting = await this.state.storage.get('greeting')
    this.hydrated = true
  }

  constructor(state, env) {
    this.state = state
    this.env = env
    this.hydrated = false
  }

  async fetch(request) {
    await this.hydrate()
    const url = new URL(request.url)
    if (url.search === '') {
      return new Response(this.greeting)
    } else {
      this.name = url.searchParams.get('name')
      this.state.storage.put('name', this.name)
      this.greeting = `${this.state.id.toString()}: `
        + `Your name is ${this.name}. HELLO ${this.name.toUpperCase()}!`
      this.state.storage.put('greeting', this.greeting)
      return new Response(this.greeting)
    }
  }
}

export class Greeter extends TransactionalDOWrapperBase {
  static TheClass = OriginalGreeter
}
